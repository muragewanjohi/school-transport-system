import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

// Helper to estimate fallback duration in seconds using Haversine formula (at 30 km/h)
function calculateFallbackDuration(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // in metres

  // Average speed of 30 km/h (approx 8.33 m/s)
  let durationSeconds = distance / 8.33;
  if (durationSeconds < 300) {
    durationSeconds = 300; // minimum 5 mins fallback
  }
  return durationSeconds;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json();
    const record = body.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "Missing queue record" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const {
      id,
      tenant_id,
      student_id,
      parent_id,
      bus_lng,
      bus_lat,
      stop_lng,
      stop_lat,
      stop_name,
      vehicle_plate,
      student_name,
      parent_name,
    } = record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch tenant configurations (including SMS enablement, templates, and Google Maps API key)
    const { data: config, error: configError } = await supabase
      .from("tenant_configs")
      .select("sms_notifications_enabled, sms_template_geofence, google_maps_api_key, mapbox_access_token")
      .eq("tenant_id", tenant_id)
      .single();

    if (configError) {
      throw new Error(`Failed to fetch tenant configuration: ${configError.message}`);
    }

    const smsEnabled = config?.sms_notifications_enabled || false;
    const template = config?.sms_template_geofence || "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.";
    const googleApiKey = config?.google_maps_api_key || Deno.env.get("GOOGLE_MAPS_API_KEY") || "";

    let durationSeconds = 300; // default 5 minutes
    let apiSuccess = false;

    // 2. Call Google Maps Distance Matrix API if key is configured
    if (googleApiKey && googleApiKey.trim() !== "") {
      try {
        const googleUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${bus_lat},${bus_lng}&destinations=${stop_lat},${stop_lng}&mode=driving&departure_time=now&key=${googleApiKey}`;

        const response = await fetch(googleUrl);
        const matrixData = await response.json();

        if (
          response.ok &&
          matrixData.status === "OK" &&
          matrixData.rows &&
          matrixData.rows[0] &&
          matrixData.rows[0].elements &&
          matrixData.rows[0].elements[0] &&
          matrixData.rows[0].elements[0].status === "OK"
        ) {
          const element = matrixData.rows[0].elements[0];
          durationSeconds = element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value;
          apiSuccess = true;
          console.log(`[Google Maps] Distance Matrix ETA for stop ${stop_name}: ${Math.round(durationSeconds / 60.0)} mins.`);
        } else {
          console.error("[Google Maps] API response error:", matrixData);
        }
      } catch (e: any) {
        console.error("[Google Maps] Network/Fetch error:", e.message);
      }
    }

    // 3. Fallback calculation if Mapbox call failed or was not configured
    if (!apiSuccess) {
      durationSeconds = calculateFallbackDuration(bus_lat, bus_lng, stop_lat, stop_lng);
      console.log(`[Fallback] Calculated Haversine ETA for stop ${stop_name}: ${Math.round(durationSeconds / 60.0)} mins.`);
    }

    // 4. Format ETA and message
    const etaMins = Math.round(durationSeconds / 60.0);
    const now = new Date();
    // Add seconds and adjust for East Africa Time (EAT = UTC + 3 hours)
    const etaTime = new Date(now.getTime() + durationSeconds * 1000);
    const etaStr = etaTime.toLocaleTimeString("en-US", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let msg = template;
    msg = msg.replace(/{parent_name}/g, parent_name || "Parent");
    msg = msg.replace(/{student_name}/g, student_name || "your child");
    msg = msg.replace(/{stop_name}/g, stop_name || "stop");
    msg = msg.replace(/{vehicle_plate}/g, vehicle_plate || "assigned bus");

    const hasEtaTime = template.includes("{eta_time}");
    const hasDurationMins = template.includes("{duration_mins}");

    if (hasEtaTime) {
      msg = msg.replace(/{eta_time}/g, etaStr);
    }
    if (hasDurationMins) {
      msg = msg.replace(/{duration_mins}/g, String(etaMins));
    }

    // Auto-append ETA info if tags were missing in the template
    if (!hasEtaTime && !hasDurationMins) {
      msg = `${msg} (Estimated ETA: ${etaStr}, approx. ${etaMins} mins away).`;
    }

    // 5. Dispatch in-app notification
    const { error: notifError } = await supabase.from("notifications").insert({
      tenant_id,
      user_id: parent_id,
      title: "Bus Approaching Stop",
      message: msg,
      notification_type: "eta",
    });

    if (notifError) {
      console.error("[ETA] Failed to insert notification:", notifError.message);
    }

    // 6. Dispatch SMS if enabled
    if (smsEnabled) {
      const { error: smsError } = await supabase.from("alerts_queue").insert({
        tenant_id,
        student_id,
        parent_id,
        message_type: "proximity",
        custom_message: msg,
      });

      if (smsError) {
        console.error("[ETA] Failed to enqueue SMS:", smsError.message);
      }
    }

    // 7. Delete the processed item from queue
    const { error: deleteError } = await supabase
      .from("eta_calculation_queue")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[ETA] Failed to remove queue item:", deleteError.message);
    }

    return new Response(JSON.stringify({ success: true, eta_mins: etaMins }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    console.error("Calculate-ETA Edge Function Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

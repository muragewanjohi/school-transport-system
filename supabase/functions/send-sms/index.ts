import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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
      return new Response(JSON.stringify({ error: "Missing record payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id, student_id, parent_id, message_type, custom_message } = record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Demo School: never send real SMS — mark processed and exit
    if (record.tenant_id) {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("is_demo")
        .eq("id", record.tenant_id)
        .maybeSingle();

      if (tenantRow?.is_demo) {
        if (id) {
          await supabase.from("alerts_queue").update({ processed: true }).eq("id", id);
        }
        return new Response(
          JSON.stringify({
            success: true,
            dry_run: true,
            message: "Demo tenant SMS suppressed",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch recipient phone and details (bypassing RLS with service role client)
    let parentPhone = "";
    let studentName = "";

    if (student_id) {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("name, parent:profiles!parent_id(phone, name)")
        .eq("id", student_id)
        .single();

      if (studentError || !student) {
        throw new Error(`Failed to fetch student details: ${studentError?.message || "Not found"}`);
      }

      // Cast the nested parent profiles join
      const parentProfile = student.parent as unknown as { phone: string; name: string } | null;
      parentPhone = parentProfile?.phone || "";
      studentName = student.name || "";
    } else if (parent_id) {
      // General profile fallback (e.g. driver/conductor or direct message)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("phone, name")
        .eq("id", parent_id)
        .single();

      if (profileError || !profile) {
        throw new Error(`Failed to fetch profile details: ${profileError?.message || "Not found"}`);
      }

      parentPhone = profile.phone || "";
      studentName = profile.name || "";
    }

    if (!parentPhone) {
      throw new Error(`Recipient phone number not found for ID: ${parent_id || student_id}`);
    }

    // Format the alert message
    let message = custom_message || "";
    const nowTime = new Date().toLocaleTimeString("en-US", { hour12: true });

    if (!message) {
      if (message_type === "proximity") {
        message = `Safaricom Track: The school bus is 5 minutes away. Please prepare ${studentName} for pickup.`;
      } else if (message_type === "boarding") {
        message = `Safaricom Track: ${studentName} has safely boarded the school bus at ${nowTime}.`;
      } else if (message_type === "dropoff") {
        message = `Safaricom Track: ${studentName} has been dropped off at school/home at ${nowTime}.`;
      } else if (message_type === "delay") {
        message = `Safaricom Track: The school bus for ${studentName} is running late. Please check the app for the updated arrival time.`;
      } else {
        throw new Error(`Invalid message type: ${message_type}`);
      }
    }

    const atUsername = (Deno.env.get("AFRICASTALKING_USERNAME") || "sandbox").trim();
    const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");
    const atSenderId = Deno.env.get("AFRICASTALKING_SENDER_ID");

    if (!atApiKey) {
      throw new Error("Missing AFRICASTALKING_API_KEY environment variable");
    }

    let cleanPhone = parentPhone.trim();
    if (cleanPhone.startsWith("0")) {
      cleanPhone = `+254${cleanPhone.slice(1)}`;
    }
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${cleanPhone}`;
    }

    const atUrl = atUsername === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";

    const postSms = async (from: string | undefined) => {
      const params = new URLSearchParams();
      params.append("username", atUsername);
      params.append("to", cleanPhone);
      params.append("message", message);
      if (from) params.append("from", from);
      const response = await fetch(atUrl, {
        method: "POST",
        headers: {
          "apiKey": atApiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: params.toString(),
      });
      const atResult: unknown = await response.json();
      return { response, atResult };
    };

    const sender = atSenderId?.trim() || undefined;
    let { response, atResult } = await postSms(sender);

    const recipientsOf = (payload: unknown) => {
      const rec = (
        payload as {
          SMSMessageData?: {
            Message?: string;
            Recipients?: Array<{ status?: string; statusCode?: number }> | { status?: string; statusCode?: number };
          };
        }
      ).SMSMessageData?.Recipients;
      if (!rec) return [];
      return Array.isArray(rec) ? rec : [rec];
    };
    const accepted = (payload: unknown) => {
      const recipient = recipientsOf(payload)[0];
      if (!recipient) return false;
      const status = recipient.status?.trim().toLowerCase();
      if (status && ["success", "sent", "processed", "queued"].includes(status)) {
        return true;
      }
      return (
        typeof recipient.statusCode === "number" &&
        recipient.statusCode >= 100 &&
        recipient.statusCode < 200
      );
    };
    const rejectionReason = (payload: unknown) => {
      const recipient = recipientsOf(payload)[0];
      if (recipient?.status?.trim()) return recipient.status.trim();
      const msg = (payload as { SMSMessageData?: { Message?: string } }).SMSMessageData?.Message?.trim();
      if (msg) {
        const token = msg.split(/[:.]/)[0]?.trim();
        if (token && !token.toLowerCase().startsWith("sent to")) return token;
        return msg.slice(0, 80);
      }
      return "unknown rejection";
    };

    if (response.ok && sender && !accepted(atResult) && /invalidsenderid/i.test(rejectionReason(atResult))) {
      ({ response, atResult } = await postSms(undefined));
    }

    if (!response.ok) {
      throw new Error(`Africa's Talking API error: HTTP ${response.status}`);
    }
    if (!accepted(atResult)) {
      throw new Error(`Africa's Talking rejected the message (${rejectionReason(atResult)})`);
    }

    // Mark enqueued alert record as processed in the database
    const { error: updateError } = await supabase
      .from("alerts_queue")
      .update({ processed: true })
      .eq("id", id);

    if (updateError) {
      console.error(`Failed to update alerts_queue row ${id}:`, updateError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "SMS dispatched successfully",
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    console.error("SMS Edge Function Error:", errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

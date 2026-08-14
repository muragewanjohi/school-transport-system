import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { assignDriverToVehicle, emptyToNullVehicleId } from "@/lib/assignDriverVehicle";
import { z } from "zod";

const driverCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(5, "Phone number too short"),
  email: z.string().email("Invalid email format"),
  national_id: z.string().min(4, "National ID must be at least 4 characters"),
  status: z.enum(["Available", "Unavailable"]).default("Available"),
  avatar_url: z.string().optional().nullable(),
  vehicle_id: z.string().min(1).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: [] });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: drivers, error } = await scope.client
      .from("profiles")
      .select("id, name, phone, email, national_id, status, avatar_url")
      .eq("role", "driver")
      .eq("tenant_id", scope.tenantId);

    if (error) {
      console.warn("Supabase drivers fetch error (might lack columns):", error.message);
      return NextResponse.json({ success: false, error: "Failed to load drivers" }, { status: 500 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: drivers ?? [] });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = driverCreateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    // Generate random 6-digit OTP and 15-minute expiration
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Clean and format phone number for Africa's Talking SMS API
    let cleanPhone = result.data.phone.trim();
    if (cleanPhone.startsWith("0")) {
      cleanPhone = `+254${cleanPhone.slice(1)}`;
    }
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${cleanPhone}`;
    }

    // Try sending SMS OTP via Africa's Talking in the background
    const atUsername = process.env.AFRICASTALKING_USERNAME || "sandbox";
    const atApiKey = process.env.AFRICASTALKING_API_KEY;
    if (atApiKey) {
      try {
        const smsParams = new URLSearchParams();
        smsParams.append("username", atUsername);
        smsParams.append("to", cleanPhone);
        smsParams.append("message", `Safaricom Track: You have been registered as a driver. Your login OTP is ${otpCode}.`);
        
        fetch("https://api.africastalking.com/version1/messaging", {
          method: "POST",
          headers: {
            "apiKey": atApiKey,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: smsParams.toString(),
        }).then(res => res.json()).then(data => {
          console.log("OTP SMS dispatched successfully via AT:", data);
        }).catch(err => {
          console.warn("Async OTP SMS API fetch failed:", err);
        });
      } catch (smsErr) {
        console.warn("Background SMS OTP dispatch error:", smsErr);
      }
    } else {
      console.log(`[SANDBOX SMS] OTP for ${cleanPhone} is ${otpCode}`);
    }

    if (!isSupabaseConfigured) {
      const newMockDriver = {
        id: `drv-${Math.floor(Math.random() * 1000)}`,
        role: "driver",
        otp_code: otpCode,
        otp_expires_at: otpExpiresAt,
        vehicle_id: emptyToNullVehicleId(result.data.vehicle_id),
        name: result.data.name,
        phone: result.data.phone,
        email: result.data.email,
        national_id: result.data.national_id,
        status: result.data.status,
        avatar_url: result.data.avatar_url ?? null,
      };
      return NextResponse.json({ success: true, source: "mock", data: newMockDriver, sandbox_otp: otpCode });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;
    const tenantId = scope.tenantId;

    const payload = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      role: "driver",
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      national_id: result.data.national_id,
      status: result.data.status,
      otp_code: otpCode,
      otp_expires_at: otpExpiresAt,
    };

    const { data: driverInsert, error } = await client
      .from("profiles")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn("Supabase driver insert error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    const vehicleId = emptyToNullVehicleId(result.data.vehicle_id);
    if (vehicleId) {
      const assigned = await assignDriverToVehicle(client, {
        tenantId,
        driverId: driverInsert.id,
        vehicleId,
      });
      if (!assigned.ok) {
        return NextResponse.json({
          success: true,
          source: "supabase",
          data: driverInsert,
          sandbox_otp: otpCode,
          assignment_error: assigned.error,
        });
      }
    }

    return NextResponse.json({ success: true, source: "supabase", data: driverInsert, sandbox_otp: otpCode });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

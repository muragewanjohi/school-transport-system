import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { assignDriverToVehicle, emptyToNullVehicleId } from "@/lib/assignDriverVehicle";
import {
  getAfricasTalkingUsername,
  sendAfricasTalkingSms,
  shouldDryRunOtpSms,
} from "@/lib/africasTalkingSms";
import { normalizeKenyanPhone } from "@/lib/kenyanPhone";
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

    const cleanPhone = normalizeKenyanPhone(result.data.phone);
    const atUsername = getAfricasTalkingUsername();
    const dryRunSms = shouldDryRunOtpSms({
      atUsername,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      otpSmsDryRun: process.env.OTP_SMS_DRY_RUN,
    });
    if (!dryRunSms) {
      void sendAfricasTalkingSms({
        to: cleanPhone,
        message: `OnTheBus: You have been registered as a driver. Your login OTP is ${otpCode}.`,
      }).catch(() => {
        console.warn("Driver registration OTP SMS failed");
      });
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
          ...(dryRunSms ? { sandbox_otp: otpCode } : {}),
          assignment_error: assigned.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: driverInsert,
      ...(dryRunSms ? { sandbox_otp: otpCode } : {}),
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

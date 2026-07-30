import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { signDriverSession } from "@/lib/driverSession";
import { z } from "zod";

const loginSchema = z.object({
  phone: z.string().min(5, "Phone number is too short"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
});

const mockDriverSession = {
  id: "drv-1",
  name: "John Kamau",
  email: "john.kamau@school.com",
  phone: "+254 712 345 678",
  role: "driver",
  tenant_id: "8c9ad841-f762-4217-a021-9876251b5bcf",
  vehicle_id: "e5015e10-c09a-4c22-901d-5573752e379c",
  route_id: "782cd841-f762-4217-a021-9876251b5bca",
};

function withAccessToken(session: {
  id: string;
  tenant_id: string;
  role: string;
  vehicle_id?: string | null;
}) {
  const access_token = signDriverSession({
    sub: session.id,
    tenant_id: session.tenant_id,
    role: session.role || "driver",
    vehicle_id: session.vehicle_id ?? null,
  });
  return { ...session, access_token };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const { phone, otp } = result.data;

    if (!isSupabaseConfigured) {
      if (otp === "123456" || otp === "589204") {
        return NextResponse.json({
          success: true,
          source: "mock",
          session: withAccessToken(mockDriverSession),
        });
      }
      return NextResponse.json({ success: false, error: "Invalid OTP code" }, { status: 401 });
    }

    const client = getServiceSupabaseClient() ?? getSupabaseClient();

    const { data, error } = await client
      .rpc("verify_driver_login", { phone_num: phone, otp_val: otp });

    if (error || !data) {
      console.error("Auth query profile error via RPC:", error?.message);
      return NextResponse.json({ success: false, error: error?.message || "Authentication failed" }, { status: 401 });
    }

    if (!data.success) {
      const status = data.error.includes("Unavailable") ? 403 : 401;
      return NextResponse.json({ success: false, error: data.error }, { status });
    }

    return NextResponse.json({
      success: true,
      source: "supabase_rpc",
      session: withAccessToken(data.session),
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

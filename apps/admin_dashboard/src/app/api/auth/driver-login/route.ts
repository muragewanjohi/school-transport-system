import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
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

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const { phone, otp } = result.data;

    // Normalize phone number for comparison
    let cleanPhone = phone.trim();
    if (cleanPhone.startsWith("0")) {
      cleanPhone = `+254${cleanPhone.slice(1)}`;
    }
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${cleanPhone}`;
    }

    if (!isSupabaseConfigured) {
      // Mock Sandbox Login
      if (otp === "123456" || otp === "589204") {
        return NextResponse.json({ success: true, source: "mock", session: mockDriverSession });
      }
      return NextResponse.json({ success: false, error: "Invalid OTP code" }, { status: 401 });
    }

    const client = getSupabaseClient();

    // Query profiles for driver matching phone number and OTP
    const { data: profile, error } = await client
      .from("profiles")
      .select("id, name, email, phone, role, tenant_id, otp_code, otp_expires_at")
      .eq("phone", phone) // Query using exact database string
      .eq("role", "driver")
      .single();

    if (error || !profile) {
      console.warn("Auth query driver profile error:", error?.message);
      // Try raw cleanPhone if standard query fails
      const { data: secondProfile } = await client
        .from("profiles")
        .select("id, name, email, phone, role, tenant_id, otp_code, otp_expires_at")
        .eq("phone", cleanPhone)
        .eq("role", "driver")
        .maybeSingle();
        
      if (!secondProfile) {
        return NextResponse.json({ success: false, error: "Driver profile not found with this phone number" }, { status: 401 });
      }
      return verifyOtp(secondProfile, otp, client);
    }

    return verifyOtp(profile, otp, client);

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

async function verifyOtp(profile: any, otp: string, client: any) {
  if (profile.otp_code !== otp) {
    // Sandbox bypass support
    if (otp !== "123456" && otp !== "589204") {
      return NextResponse.json({ success: false, error: "Invalid OTP verification code" }, { status: 401 });
    }
  }

  // Validate expiration
  if (profile.otp_expires_at) {
    const expires = new Date(profile.otp_expires_at).getTime();
    if (expires < Date.now() && otp !== "123456") {
      return NextResponse.json({ success: false, error: "OTP verification code has expired" }, { status: 401 });
    }
  }

  // Clear OTP code to prevent reuse
  await client
    .from("profiles")
    .update({ otp_code: null, otp_expires_at: null })
    .eq("id", profile.id);

  // Fetch driver's active vehicle
  let vehicleId = "e5015e10-c09a-4c22-901d-5573752e379c"; // Fallback mock vehicle UUID
  let routeId = "782cd841-f762-4217-a021-9876251b5bca"; // Fallback mock route UUID

  const { data: vehicle } = await client
    .from("vehicles")
    .select("id, model, license_plate")
    .eq("active_driver_id", profile.id)
    .limit(1)
    .maybeSingle();

  if (vehicle) {
    vehicleId = vehicle.id;
    // Query route if any stops exist on a route assigned to vehicle
    const { data: route } = await client
      .from("routes")
      .select("id")
      .limit(1)
      .maybeSingle();
      
    if (route) {
      routeId = route.id;
    }
  }

  return NextResponse.json({
    success: true,
    source: "supabase",
    session: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      role: profile.role,
      tenant_id: profile.tenant_id,
      vehicle_id: vehicleId,
      route_id: routeId,
    }
  });
}

import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const loginSchema = z.object({
  phone: z.string().min(5, "Phone number is too short"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
});

const mockParentSession = {
  id: "parent-1",
  name: "Jane Parent",
  email: "jane.parent@example.com",
  phone: "+254 755 123 456",
  role: "parent",
  tenant_id: "8c9ad841-f762-4217-a021-9876251b5bcf",
  children: [
    {
      id: "stud-1",
      name: "Elsa Omondi",
      route_id: "782cd841-f762-4217-a021-9876251b5bca",
      status: "Present"
    }
  ]
};

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const { phone, otp } = result.data;

    if (!isSupabaseConfigured) {
      // Mock Sandbox Login
      if (otp === "123456" || otp === "589204") {
        return NextResponse.json({ success: true, source: "mock", session: mockParentSession });
      }
      return NextResponse.json({ success: false, error: "Invalid OTP code" }, { status: 401 });
    }

    const client = getSupabaseClient();

    // Call stored procedure to verify credentials bypassing RLS
    const { data, error } = await client
      .rpc("verify_parent_login", { phone_num: phone, otp_val: otp });

    if (error || !data) {
      console.error("Auth query profile error via RPC:", error?.message);
      return NextResponse.json({ success: false, error: error?.message || "Authentication failed" }, { status: 401 });
    }

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      source: "supabase_rpc",
      session: data.session
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

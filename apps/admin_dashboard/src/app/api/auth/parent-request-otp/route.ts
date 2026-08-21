import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { issuePhoneOtp } from "@/lib/issuePhoneOtp";

const requestSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(9, "Phone number is too short")
    .max(24, "Phone number is too long")
    .regex(/^[+\d\s()-]+$/, "Phone number contains invalid characters"),
});

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = requestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, errors: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        message: "OTP sent successfully (Sandbox Mode)",
        sandbox_otp: "123456",
      });
    }

    const client = getServiceSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Authentication service is unavailable" },
        { status: 503 }
      );
    }

    const issued = await issuePhoneOtp(client, {
      phone: result.data.phone,
      roles: ["parent"],
      smsMessage: (otp) =>
        `OnTheBus: Your parent app verification code is ${otp}. It expires in 15 minutes.`,
      notRegisteredError:
        "This phone number is not registered as a parent profile.",
      notRegisteredCode: "not_registered",
    });

    return NextResponse.json(issued.body, { status: issued.status });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

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
  channel: z.enum(["sms", "email"]).optional(),
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
        message: "OTP sent successfully",
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
      roles: ["driver", "conductor"],
      channel: result.data.channel,
      smsMessage: (otp) =>
        `OnTheBus: Your driver app verification code is ${otp}. It expires in 15 minutes.`,
      emailMessage: (otp) => ({
        subject: "OnTheBus driver verification code",
        text: `Your OnTheBus driver app verification code is ${otp}. It expires in 15 minutes.\n\nIf you did not request this code, ignore this email.`,
      }),
      notRegisteredError:
        "This number is not registered as a driver or conductor. Please contact your school to get access.",
      notRegisteredCode: "not_registered",
      enforceUnavailableStatus: true,
    });

    return NextResponse.json(issued.body, { status: issued.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const requestSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(9, "Phone number is too short")
    .max(24, "Phone number is too long")
    .regex(/^[+\d\s()-]+$/, "Phone number contains invalid characters"),
});

function normalizeKenyanPhone(phone: string): string {
  const compact = phone.replace(/[\s()-]+/g, "");
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  if (compact.startsWith("+")) return compact;
  return `+${compact}`;
}

function phoneVariants(phone: string): string[] {
  const normalized = normalizeKenyanPhone(phone);
  const local = normalized.startsWith("+254") ? normalized.slice(4) : "";
  if (local.length !== 9) return [normalized];
  return [
    normalized,
    `+254 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`,
    `0${local}`,
    local,
  ];
}

async function sendOtpSms(phone: string, otp: string): Promise<void> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!apiKey) {
    throw new Error("SMS delivery is not configured");
  }

  const username = process.env.AFRICASTALKING_USERNAME || "sandbox";
  const params = new URLSearchParams({
    username,
    to: phone,
    message: `OnTheBus: Your driver app verification code is ${otp}. It expires in 15 minutes.`,
  });

  const apiUrl = username === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
  const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

  if (!response.ok) {
    throw new Error(`SMS provider returned HTTP ${response.status}`);
  }
}

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

    const phone = normalizeKenyanPhone(result.data.phone);
    const phoneFilter = phoneVariants(phone)
      .map((candidate) => `phone.eq.${candidate}`)
      .join(",");
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, tenant_id, status, otp_code")
      .in("role", ["driver", "conductor"])
      .or(phoneFilter)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { success: false, error: "Unable to verify this account" },
        { status: 500 }
      );
    }
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "This phone number is not registered for the Driver app." },
        { status: 404 }
      );
    }
    if (profile.status === "Unavailable") {
      return NextResponse.json(
        { success: false, error: "This account is currently unavailable. Contact your school administrator." },
        { status: 403 }
      );
    }

    const { data: tenant } = await client
      .from("tenants")
      .select("is_demo")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    const isDemo = tenant?.is_demo === true;
    const otp = isDemo && profile.otp_code
      ? profile.otp_code
      : Math.floor(100000 + Math.random() * 900000).toString();

    if (!isDemo) {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: updateError } = await client
        .from("profiles")
        .update({ otp_code: otp, otp_expires_at: expiresAt })
        .eq("id", profile.id);

      if (updateError) {
        return NextResponse.json(
          { success: false, error: "Unable to create a verification code" },
          { status: 500 }
        );
      }

      await sendOtpSms(phone, otp);
    }

    return NextResponse.json({
      success: true,
      source: isDemo ? "demo" : "sms",
      message: "OTP sent successfully",
      ...(isDemo ? { sandbox_otp: otp } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

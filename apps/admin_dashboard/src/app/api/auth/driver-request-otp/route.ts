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

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    signal: AbortSignal.timeout(8_000),
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
    const profileQuery = client
      .from("profiles")
      .select("id, tenant_id, status, otp_code")
      .in("role", ["driver", "conductor"])
      .or(phoneFilter)
      .limit(1)
      .maybeSingle();

    let profile: {
      id: string;
      tenant_id: string;
      status: string | null;
      otp_code: string | null;
    } | null = null;
    try {
      const { data, error: profileError } = await withTimeout(
        profileQuery,
        8_000,
        "Profile lookup"
      );
      if (profileError) {
        return NextResponse.json(
          { success: false, error: "Unable to verify this account" },
          { status: 500 }
        );
      }
      profile = data;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot reach the database from this machine. Use production API or check your network/VPN.",
        },
        { status: 503 }
      );
    }
    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          code: "not_registered",
          error:
            "This number is not registered as a driver or conductor. Please contact your school to get access.",
        },
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
      .select("is_demo, domain")
      .eq("id", profile.tenant_id)
      .maybeSingle();

    const isDemo = tenant?.is_demo === true;
    const isPlayReview = tenant?.domain === "play-review";
    const otp = isPlayReview
      ? profile.otp_code || "123456"
      : Math.floor(100000 + Math.random() * 900000).toString();

    if (!isPlayReview) {
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
    }

    // Play Review uses fixed OTP 123456 — never block login on SMS.
    if (isPlayReview) {
      return NextResponse.json({
        success: true,
        source: "play_review",
        message: "OTP ready (use 123456)",
      });
    }

    const atUsername = process.env.AFRICASTALKING_USERNAME || "sandbox";
    const forceDryRun =
      isDemo ||
      process.env.NODE_ENV !== "production" ||
      atUsername === "sandbox" ||
      process.env.OTP_SMS_DRY_RUN === "true";

    // Skip Africa's Talking when local/demo/sandbox so the Flutter client
    // does not hit its 20s timeout waiting on a hung SMS provider.
    if (forceDryRun) {
      return NextResponse.json({
        success: true,
        source: isDemo ? "demo_sms_dry_run" : "dev_sms_dry_run",
        message: "OTP created (SMS dry-run)",
        sandbox_otp: otp,
      });
    }

    try {
      await sendOtpSms(phone, otp);
    } catch (smsError: unknown) {
      const detail =
        smsError instanceof Error ? smsError.message : "SMS delivery failed";
      return NextResponse.json(
        { success: false, error: `Unable to send SMS: ${detail}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      source: "sms",
      message: "OTP sent successfully",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

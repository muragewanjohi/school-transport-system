import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAfricasTalkingUsername,
  resolveOtpDelivery,
  sendAfricasTalkingSms,
} from "@/lib/africasTalkingSms";
import { normalizeKenyanPhone, phoneFilterOrClause } from "@/lib/kenyanPhone";

const PLAY_REVIEW_OTP = "123456";

export type IssuePhoneOtpBody = {
  success: boolean;
  source?: string;
  message?: string;
  sandbox_otp?: string;
  error?: string;
  code?: string;
};

export type IssuePhoneOtpResult = {
  status: number;
  body: IssuePhoneOtpBody;
};

type ProfileRow = {
  id: string;
  tenant_id: string;
  status: string | null;
  otp_code: string | null;
};

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

function generateOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

export async function issuePhoneOtp(
  client: SupabaseClient,
  input: {
    phone: string;
    roles: string[];
    smsMessage: (otp: string) => string;
    notRegisteredError: string;
    notRegisteredCode?: string;
    enforceUnavailableStatus?: boolean;
  }
): Promise<IssuePhoneOtpResult> {
  const phone = normalizeKenyanPhone(input.phone);
  const phoneFilter = phoneFilterOrClause(phone);
  const profileQuery = client
    .from("profiles")
    .select("id, tenant_id, status, otp_code")
    .in("role", input.roles)
    .or(phoneFilter)
    .limit(1)
    .maybeSingle();

  let profile: ProfileRow | null = null;
  try {
    const { data, error: profileError } = await withTimeout(
      profileQuery,
      8_000,
      "Profile lookup"
    );
    if (profileError) {
      return {
        status: 500,
        body: { success: false, error: "Unable to verify this account" },
      };
    }
    profile = data as ProfileRow | null;
  } catch {
    return {
      status: 503,
      body: {
        success: false,
        error:
          "Cannot reach the database from this machine. Use production API or check your network/VPN.",
      },
    };
  }

  if (!profile) {
    return {
      status: 404,
      body: {
        success: false,
        code: input.notRegisteredCode,
        error: input.notRegisteredError,
      },
    };
  }

  if (input.enforceUnavailableStatus && profile.status === "Unavailable") {
    return {
      status: 403,
      body: {
        success: false,
        error:
          "This account is currently unavailable. Contact your school administrator.",
      },
    };
  }

  const { data: tenant } = await client
    .from("tenants")
    .select("is_demo, domain")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const isPlayReview = tenant?.domain === "play-review";
  const delivery = resolveOtpDelivery({
    isPlayReview,
    atUsername: getAfricasTalkingUsername(),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    otpSmsDryRun: process.env.OTP_SMS_DRY_RUN,
  });

  const otp =
    delivery === "play_review"
      ? profile.otp_code || PLAY_REVIEW_OTP
      : generateOtp();

  if (delivery !== "play_review") {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: updateError } = await client
      .from("profiles")
      .update({ otp_code: otp, otp_expires_at: expiresAt })
      .eq("id", profile.id);

    if (updateError) {
      return {
        status: 500,
        body: { success: false, error: "Unable to create a verification code" },
      };
    }
  }

  if (delivery === "play_review") {
    return {
      status: 200,
      body: {
        success: true,
        source: "play_review",
        message: "OTP ready (use 123456)",
      },
    };
  }

  if (delivery === "dry_run") {
    return {
      status: 200,
      body: {
        success: true,
        source:
          tenant?.is_demo === true ? "demo_sms_dry_run" : "dev_sms_dry_run",
        message: "OTP created (SMS dry-run)",
        sandbox_otp: otp,
      },
    };
  }

  try {
    await sendAfricasTalkingSms({
      to: phone,
      message: input.smsMessage(otp),
    });
  } catch (smsError: unknown) {
    const detail =
      smsError instanceof Error ? smsError.message : "SMS delivery failed";
    return {
      status: 502,
      body: { success: false, error: `Unable to send SMS: ${detail}` },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      source: "sms",
      message: "OTP sent successfully",
    },
  };
}

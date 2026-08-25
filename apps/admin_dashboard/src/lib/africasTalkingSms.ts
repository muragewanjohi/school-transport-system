export const AFRICASTALKING_SANDBOX_URL =
  "https://api.sandbox.africastalking.com/version1/messaging";
export const AFRICASTALKING_LIVE_URL =
  "https://api.africastalking.com/version1/messaging";

const ACCEPTED_STATUSES = new Set(["success", "sent", "processed", "queued"]);

export function getAfricasTalkingUsername(
  username = process.env.AFRICASTALKING_USERNAME
): string {
  const trimmed = username?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "sandbox";
}

export function getAfricasTalkingMessagingUrl(username: string): string {
  return getAfricasTalkingUsername(username) === "sandbox"
    ? AFRICASTALKING_SANDBOX_URL
    : AFRICASTALKING_LIVE_URL;
}

export type OtpDelivery = "play_review" | "dry_run" | "sms";

export function shouldDryRunOtpSms(input: {
  atUsername: string;
  nodeEnv?: string;
  vercelEnv?: string;
  otpSmsDryRun?: string;
}): boolean {
  if (input.otpSmsDryRun === "true") return true;
  if (getAfricasTalkingUsername(input.atUsername) === "sandbox") return true;
  if (input.otpSmsDryRun === "false") return false;
  if (input.vercelEnv === "preview" || input.vercelEnv === "development") {
    return true;
  }
  return input.nodeEnv !== "production";
}

export function resolveOtpDelivery(input: {
  isPlayReview: boolean;
  atUsername: string;
  nodeEnv?: string;
  vercelEnv?: string;
  otpSmsDryRun?: string;
}): OtpDelivery {
  if (input.isPlayReview) return "play_review";
  if (shouldDryRunOtpSms(input)) return "dry_run";
  return "sms";
}

type AtRecipient = {
  status?: string;
  statusCode?: number | string;
};

type AtPayload = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AtRecipient | AtRecipient[];
  };
};

function asObject(payload: unknown): AtPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  return payload as AtPayload;
}

function recipientList(payload: unknown): AtRecipient[] {
  const rec = asObject(payload)?.SMSMessageData?.Recipients;
  if (!rec) return [];
  return Array.isArray(rec) ? rec : [rec];
}

export function firstRecipient(payload: unknown): AtRecipient | undefined {
  return recipientList(payload)[0];
}

function asStatusCode(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

export function africastalkingAccepted(payload: unknown): boolean {
  const recipient = firstRecipient(payload);
  if (!recipient) return false;
  const status = recipient.status?.trim().toLowerCase();
  if (status && ACCEPTED_STATUSES.has(status)) return true;
  const code = asStatusCode(recipient.statusCode);
  return code !== undefined && code >= 100 && code < 200;
}

export function africastalkingRejectionReason(payload: unknown): string {
  const recipient = firstRecipient(payload);
  const status = recipient?.status?.trim();
  if (status) return status;
  const message = asObject(payload)?.SMSMessageData?.Message?.trim();
  if (message) {
    const token = message.split(/[:.]/)[0]?.trim();
    if (token && !token.toLowerCase().startsWith("sent to")) {
      return token;
    }
    return message.slice(0, 80);
  }
  return "unknown rejection";
}

export function isInvalidSenderId(payload: unknown): boolean {
  const reason = africastalkingRejectionReason(payload).toLowerCase();
  const code = asStatusCode(firstRecipient(payload)?.statusCode);
  return reason.includes("invalidsenderid") || code === 402;
}

export async function sendAfricasTalkingSms(input: {
  to: string;
  message: string;
  apiKey?: string;
  username?: string;
  senderId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<void> {
  const apiKey = input.apiKey ?? process.env.AFRICASTALKING_API_KEY;
  if (!apiKey) {
    throw new Error("SMS delivery is not configured");
  }

  const username = getAfricasTalkingUsername(input.username);
  const senderId = (input.senderId ?? process.env.AFRICASTALKING_SENDER_ID)?.trim();
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 8_000;

  const post = async (from: string | undefined): Promise<{
    ok: boolean;
    status: number;
    payload: unknown;
  }> => {
    const params = new URLSearchParams({
      username,
      to: input.to,
      message: input.message,
    });
    if (from) params.append("from", from);

    const response = await fetchImpl(getAfricasTalkingMessagingUrl(username), {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { ok: response.ok, status: response.status, payload };
  };

  let result = await post(senderId || undefined);
  if (
    result.ok &&
    senderId &&
    !africastalkingAccepted(result.payload) &&
    isInvalidSenderId(result.payload)
  ) {
    result = await post(undefined);
  }

  if (!result.ok) {
    throw new Error(`SMS provider returned HTTP ${result.status}`);
  }
  if (!africastalkingAccepted(result.payload)) {
    throw new Error(
      `SMS provider rejected the message (${africastalkingRejectionReason(result.payload)})`
    );
  }
}

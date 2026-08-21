export const AFRICASTALKING_SANDBOX_URL =
  "https://api.sandbox.africastalking.com/version1/messaging";
export const AFRICASTALKING_LIVE_URL =
  "https://api.africastalking.com/version1/messaging";

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
  statusCode?: number;
};

function firstRecipient(payload: unknown): AtRecipient | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const data = payload as {
    SMSMessageData?: { Recipients?: AtRecipient[] };
  };
  return data.SMSMessageData?.Recipients?.[0];
}

export function africastalkingAccepted(payload: unknown): boolean {
  const recipient = firstRecipient(payload);
  if (!recipient) return false;
  if (recipient.status === "Success") return true;
  return (
    typeof recipient.statusCode === "number" &&
    recipient.statusCode >= 100 &&
    recipient.statusCode < 200
  );
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
  const senderId = input.senderId ?? process.env.AFRICASTALKING_SENDER_ID;
  const params = new URLSearchParams({
    username,
    to: input.to,
    message: input.message,
  });
  if (senderId && senderId.trim()) {
    params.append("from", senderId.trim());
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 8_000;
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

  if (!response.ok) {
    throw new Error(`SMS provider returned HTTP ${response.status}`);
  }
  if (!africastalkingAccepted(payload)) {
    throw new Error("SMS provider did not accept the message");
  }
}

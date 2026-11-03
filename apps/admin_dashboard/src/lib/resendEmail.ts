/**
 * Thin Resend helper for public marketing mail (contact / careers).
 * Skips quietly when RESEND_API_KEY is unset (local / preview).
 */

export type ResendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Override From; defaults to PUBLIC_CONTACT_FROM_EMAIL → DEMO_REQUESTS_FROM_EMAIL → Resend test sender */
  from?: string;
};

export type ResendSendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: string };

export async function sendResendEmail(params: ResendEmailParams): Promise<boolean> {
  return (await sendResendEmailWithId(params)).ok;
}

/** Same as sendResendEmail, but returns Resend's email id (for delivery webhooks). */
export async function sendResendEmailWithId(params: ResendEmailParams): Promise<ResendSendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.info("[resend] Email skipped — no RESEND_API_KEY:", {
      subject: params.subject,
    });
    return { ok: false, reason: "email not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          params.from ||
          process.env.PUBLIC_CONTACT_FROM_EMAIL ||
          process.env.DEMO_REQUESTS_FROM_EMAIL ||
          "OnTheBus <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        text: params.text,
        ...(params.html ? { html: params.html } : {}),
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[resend] Rejected email:", res.status, detail);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true, id: typeof body?.id === "string" ? body.id : null };
  } catch (err) {
    console.warn("[resend] Email failed:", err);
    return { ok: false, reason: "network error" };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inbox for company contact + careers (brand domain). */
export const PUBLIC_INBOX_EMAIL =
  process.env.PUBLIC_CONTACT_TO_EMAIL || "info@onthebus.app";

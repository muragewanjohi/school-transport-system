/**
 * Thin Resend helper for public marketing mail (contact / careers).
 * Skips quietly when RESEND_API_KEY is unset (local / preview).
 */

export async function sendResendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.info("[resend] Email skipped — no RESEND_API_KEY:", {
      to: params.to,
      subject: params.subject,
    });
    return false;
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
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[resend] Email failed:", err);
    return false;
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

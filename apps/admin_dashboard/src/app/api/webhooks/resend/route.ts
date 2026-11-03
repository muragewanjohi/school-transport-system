import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { applyOtpDeliveryReport } from "@/lib/otpDeliveryLog";
import { mapResendEvent } from "@/lib/otpDeliveryStatus";
import { verifySvixSignature } from "@/lib/webhookAuth";

/**
 * Resend email webhook (delivered / bounced / complained).
 * Configure in Resend → Webhooks with URL https://www.onthebusapp.com/api/webhooks/resend
 * and put its signing secret (whsec_…) in RESEND_WEBHOOK_SECRET.
 * Other Resend mail (demo requests, contact) has no log row and is acknowledged with 200.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "Email webhooks are not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const valid = verifySvixSignature({
    secret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    rawBody,
  });
  if (!valid) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof event.type === "string" ? event.type : "";
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  const update = mapResendEvent(type);
  if (!update || !emailId) {
    return NextResponse.json({ success: true, updated: 0, ignored: type || "unknown event" });
  }

  const db = getServiceSupabaseClient();
  if (!db) {
    return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
  }

  const updated = await applyOtpDeliveryReport(db, "resend", emailId, update);
  return NextResponse.json({ success: true, updated });
}

import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { applyOtpDeliveryReport } from "@/lib/otpDeliveryLog";
import { mapAfricasTalkingReport } from "@/lib/otpDeliveryStatus";
import { safeEqual } from "@/lib/webhookAuth";

/**
 * Africa's Talking SMS delivery-report callback.
 * Configure in AT dashboard → SMS → Callback URLs → Delivery Reports:
 *   https://www.onthebusapp.com/api/webhooks/africastalking/delivery-report?token=<AFRICASTALKING_DLR_TOKEN>
 * AT does not sign callbacks, so the secret token in the URL authenticates it.
 * Unknown message ids (e.g. trip alert SMS) are acknowledged with 200 so AT stops retrying.
 */

async function readFields(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  const raw = await request.text();
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v == null ? "" : String(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(request: Request) {
  const expected = process.env.AFRICASTALKING_DLR_TOKEN;
  if (!expected) {
    return NextResponse.json({ success: false, error: "Delivery reports are not configured" }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") || "";
  if (!safeEqual(token, expected)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const fields = await readFields(request);
  const messageId = (fields.id || "").trim();
  const status = (fields.status || "").trim();
  if (!messageId || !status) {
    return NextResponse.json({ success: false, error: "id and status are required" }, { status: 400 });
  }

  const update = mapAfricasTalkingReport(status, fields.failureReason);
  if (!update) {
    return NextResponse.json({ success: true, updated: 0, ignored: "intermediate status" });
  }

  const db = getServiceSupabaseClient();
  if (!db) {
    return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
  }

  const updated = await applyOtpDeliveryReport(db, "africastalking", messageId, update);
  return NextResponse.json({ success: true, updated });
}

/**
 * Pure helpers for the OTP delivery log (shared by server routes and console UI).
 * Spec: context/architecture.md — "OTP delivery log".
 */
import { guardianPhonesMatch } from "@/lib/studentGuardians";

export type OtpChannel = "sms" | "email";
export type OtpProvider = "africastalking" | "resend";
export type OtpDeliveryState = "sent" | "failed" | "delivered" | "undelivered";

export type OtpDeliveryRow = {
  profile_id: string | null;
  channel: OtpChannel;
  status: OtpDeliveryState;
  failure_reason: string | null;
  destination: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Profile phone, joined by the API so the roster can match guardians. */
  phone?: string | null;
};

export type StatusUpdate = { status: OtpDeliveryState; failureReason: string | null };

/** "+254701689463" → "+254******463". Keeps enough to recognise, not to dial. */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 7) return "***";
  return `${trimmed.slice(0, 4)}${"*".repeat(trimmed.length - 7)}${trimmed.slice(-3)}`;
}

/**
 * Africa's Talking delivery-report status → our status.
 * Intermediate states (Sent, Submitted, Buffered) return null: keep "sent".
 */
export function mapAfricasTalkingReport(status: string, failureReason?: string | null): StatusUpdate | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "success") return { status: "delivered", failureReason: null };
  if (normalized === "failed" || normalized === "rejected") {
    return { status: "undelivered", failureReason: failureReason?.trim() || status.trim() };
  }
  return null;
}

/** Resend webhook event type → our status. Unhandled events return null. */
export function mapResendEvent(type: string): StatusUpdate | null {
  switch (type) {
    case "email.delivered":
      return { status: "delivered", failureReason: null };
    case "email.bounced":
      return { status: "undelivered", failureReason: "bounced" };
    case "email.complained":
      return { status: "delivered", failureReason: "marked as spam" };
    default:
      return null;
  }
}

function rowTime(row: OtpDeliveryRow): number {
  return new Date(row.created_at).getTime();
}

/** Latest attempt per profile_id (rows may arrive in any order). */
export function latestDeliveryPerProfile(rows: OtpDeliveryRow[]): Map<string, OtpDeliveryRow> {
  const latest = new Map<string, OtpDeliveryRow>();
  for (const row of rows) {
    if (!row.profile_id) continue;
    const current = latest.get(row.profile_id);
    if (!current || rowTime(row) > rowTime(current)) latest.set(row.profile_id, row);
  }
  return latest;
}

/** Find the latest delivery for a guardian by phone (guardians have no profile id). */
export function deliveryForPhone(
  latest: Iterable<OtpDeliveryRow>,
  phone: string | null | undefined
): OtpDeliveryRow | null {
  if (!phone) return null;
  let best: OtpDeliveryRow | null = null;
  for (const row of latest) {
    if (!row.phone || !guardianPhonesMatch(row.phone, phone)) continue;
    if (!best || rowTime(row) > rowTime(best)) best = row;
  }
  return best;
}

export type OtpDeliveryLabel = {
  text: string;
  tone: "success" | "muted" | "error";
  title: string;
};

function shortTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return time;
  const date = at.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
  return `${date} ${time}`;
}

/** Chip text, e.g. "SMS not delivered · UserInBlacklist · 10:42". */
export function otpDeliveryLabel(row: OtpDeliveryRow, now = new Date()): OtpDeliveryLabel {
  const channel = row.channel === "sms" ? "SMS" : "Email";
  const outcome: Record<OtpDeliveryState, { word: string; tone: OtpDeliveryLabel["tone"] }> = {
    delivered: { word: "delivered", tone: "success" },
    sent: { word: "sent, awaiting delivery", tone: "muted" },
    failed: { word: "failed", tone: "error" },
    undelivered: { word: "not delivered", tone: "error" },
  };
  const { word, tone } = outcome[row.status];
  const reason = row.failure_reason ? ` · ${row.failure_reason}` : "";
  const when = shortTime(row.updated_at || row.created_at, now);
  const destination = row.destination ? ` to ${row.destination}` : "";
  return {
    text: `Login code: ${channel} ${word}${reason} · ${when}`,
    tone,
    title: `Last login code ${channel.toLowerCase()}${destination}: ${word}${reason}. Requested ${new Date(row.created_at).toLocaleString("en-KE")}.`,
  };
}

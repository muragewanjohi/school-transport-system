/**
 * Server-side writes for the OTP delivery log (service-role client only).
 * Never throws: a logging failure must not fail an OTP request or a webhook.
 * Never receives or stores the OTP code.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OtpChannel, OtpDeliveryState, OtpProvider, StatusUpdate } from "@/lib/otpDeliveryStatus";

export type OtpDeliveryEntry = {
  tenantId: string;
  profileId: string;
  role: string | null;
  channel: OtpChannel;
  provider: OtpProvider;
  providerMessageId: string | null;
  /** Already masked (maskPhone / maskEmailHint). */
  destination: string;
  status: Extract<OtpDeliveryState, "sent" | "failed">;
  failureReason: string | null;
};

export async function recordOtpDelivery(client: SupabaseClient, entry: OtpDeliveryEntry): Promise<void> {
  try {
    const { error } = await client.from("otp_delivery_log").insert({
      tenant_id: entry.tenantId,
      profile_id: entry.profileId,
      role: entry.role,
      channel: entry.channel,
      provider: entry.provider,
      provider_message_id: entry.providerMessageId,
      destination: entry.destination,
      status: entry.status,
      failure_reason: entry.failureReason,
    });
    if (error) console.warn("[otp-log] insert failed:", error.message);
  } catch (err) {
    console.warn("[otp-log] insert threw:", err instanceof Error ? err.message : "unknown");
  }
}

/** Applies a delivery report. Returns how many rows matched (0 for unknown ids). */
export async function applyOtpDeliveryReport(
  client: SupabaseClient,
  provider: OtpProvider,
  providerMessageId: string,
  update: StatusUpdate
): Promise<number> {
  try {
    const { data, error } = await client
      .from("otp_delivery_log")
      .update({
        status: update.status,
        failure_reason: update.failureReason,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", provider)
      .eq("provider_message_id", providerMessageId)
      .select("id");
    if (error) {
      console.warn("[otp-log] report update failed:", error.message);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.warn("[otp-log] report update threw:", err instanceof Error ? err.message : "unknown");
    return 0;
  }
}

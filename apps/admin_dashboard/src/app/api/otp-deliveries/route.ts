import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { latestDeliveryPerProfile, type OtpDeliveryRow } from "@/lib/otpDeliveryStatus";

/** Matches the nightly purge retention. */
export const OTP_DELIVERY_WINDOW_DAYS = 30;

type DbRow = Omit<OtpDeliveryRow, "phone"> & {
  profile?: { phone?: string | null } | Array<{ phone?: string | null }> | null;
};

/**
 * Latest login-code attempt per profile in the caller's school (last 30 days).
 * School admins and platform super_admin on the school subdomain; crew tokens are rejected.
 */
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: [] });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const since = new Date(Date.now() - OTP_DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await scope.client
      .from("otp_delivery_log")
      .select("profile_id, channel, status, failure_reason, destination, created_at, updated_at, profile:profiles(phone)")
      .eq("tenant_id", scope.tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to load login code history" }, { status: 500 });
    }

    const rows: OtpDeliveryRow[] = ((data ?? []) as DbRow[]).map(({ profile, ...row }) => {
      const joined = Array.isArray(profile) ? profile[0] : profile;
      return { ...row, phone: joined?.phone ?? null };
    });

    return NextResponse.json({ success: true, source: "supabase", data: [...latestDeliveryPerProfile(rows).values()] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

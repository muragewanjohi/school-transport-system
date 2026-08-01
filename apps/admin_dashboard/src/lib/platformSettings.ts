import type { getServiceSupabaseClient } from "@/lib/supabaseAdmin";

export const PLATFORM_SETTING_DEFAULTS: Record<string, number> = {
  default_campus_monthly_fee_kes: 10000,
  // Days a suspended school is kept before auto soft-delete; 0 disables
  suspended_purge_days: 90,
  // Days a soft-deleted school is kept before permanent purge; 0 disables
  deleted_purge_days: 30,
};

type AdminClient = NonNullable<ReturnType<typeof getServiceSupabaseClient>>;

export async function readPlatformNumberSettings(adminClient: AdminClient): Promise<Record<string, number>> {
  const { data } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", Object.keys(PLATFORM_SETTING_DEFAULTS));

  const result: Record<string, number> = { ...PLATFORM_SETTING_DEFAULTS };
  for (const row of data ?? []) {
    const parsed = typeof row.value === "number" ? row.value : Number(row.value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      result[row.key] = parsed;
    }
  }
  return result;
}

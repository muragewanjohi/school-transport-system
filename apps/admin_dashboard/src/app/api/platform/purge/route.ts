import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { readPlatformNumberSettings } from "@/lib/platformSettings";
import { removeTenantSubdomain } from "@/lib/vercelDomains";

/**
 * Tenant lifecycle purge, run daily by Vercel Cron (see vercel.json):
 * 1. Schools suspended longer than `suspended_purge_days` are soft-deleted
 *    (frees the subdomain, releases it from Vercel).
 * 2. Schools soft-deleted longer than `deleted_purge_days` are permanently
 *    removed (FK cascade drops campuses, students, routes, billing, ...).
 * A stage is skipped when its setting is 0.
 */

async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  const caller = await getCallerProfile(request);
  return isPlatformSuperAdmin(caller);
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { softDeleted: 0, purged: 0 } });
    }

    if (!(await isAuthorized(request))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const settings = await readPlatformNumberSettings(adminClient);
    const suspendedDays = settings.suspended_purge_days;
    const deletedDays = settings.deleted_purge_days;

    const nowMs = Date.now();
    const notes: string[] = [];
    let softDeleted = 0;
    let purged = 0;
    let demoPurged = 0;

    // Stage 0: expired per-lead demo stores -> hard delete + Auth cleanup
    {
      const nowIso = new Date(nowMs).toISOString();
      const { data: expiredDemos, error: demoQueryError } = await adminClient
        .from("tenants")
        .select("id, name, domain, demo_expires_at")
        .eq("is_demo", true)
        .not("demo_expires_at", "is", null)
        .lt("demo_expires_at", nowIso)
        .neq("domain", "demo");

      if (demoQueryError) {
        notes.push(`demo expiry query failed: ${demoQueryError.message}`);
      } else {
        const { purgeDemoTenant } = await import("@/lib/demoProvision");
        for (const tenant of expiredDemos ?? []) {
          const result = await purgeDemoTenant(adminClient, tenant.id);
          if (!result.ok) {
            notes.push(`demo purge ${tenant.id} failed: ${result.detail}`);
            continue;
          }
          demoPurged += 1;
        }
      }
    }

    // Stage 1: expired suspensions -> soft delete
    if (suspendedDays > 0) {
      const suspendedCutoff = new Date(nowMs - suspendedDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: expiredSuspended, error } = await adminClient
        .from("tenants")
        .select("id, name, domain, suspended_at")
        .eq("status", "suspended")
        .eq("is_demo", false)
        .is("deleted_at", null)
        .not("suspended_at", "is", null)
        .lt("suspended_at", suspendedCutoff);

      if (error) {
        notes.push(`suspended query failed: ${error.message}`);
      }

      for (const tenant of expiredSuspended ?? []) {
        const now = new Date().toISOString();
        const { error: updateError } = await adminClient
          .from("tenants")
          .update({
            deleted_at: now,
            updated_at: now,
            domain: `deleted-${tenant.id.slice(0, 8)}-${Date.now()}`,
          })
          .eq("id", tenant.id)
          .is("deleted_at", null);

        if (updateError) {
          notes.push(`soft delete ${tenant.id} failed: ${updateError.message}`);
          continue;
        }

        await adminClient
          .from("campuses")
          .update({ deleted_at: now, status: "suspended", updated_at: now })
          .eq("tenant_id", tenant.id)
          .is("deleted_at", null);

        if (tenant.domain && !tenant.domain.startsWith("deleted-")) {
          const vercel = await removeTenantSubdomain(tenant.domain);
          if (!vercel.ok) notes.push(`vercel cleanup ${tenant.domain}: ${vercel.detail}`);
        }
        softDeleted += 1;
      }
    }

    // Stage 2: expired soft deletes -> permanent purge (FK cascade)
    if (deletedDays > 0) {
      const deletedCutoff = new Date(nowMs - deletedDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: expiredDeleted, error } = await adminClient
        .from("tenants")
        .select("id, name, deleted_at")
        .eq("is_demo", false)
        .not("deleted_at", "is", null)
        .lt("deleted_at", deletedCutoff);

      if (error) {
        notes.push(`deleted query failed: ${error.message}`);
      }

      for (const tenant of expiredDeleted ?? []) {
        const { error: deleteError } = await adminClient.from("tenants").delete().eq("id", tenant.id);
        if (deleteError) {
          notes.push(`purge ${tenant.id} failed: ${deleteError.message}`);
          continue;
        }
        purged += 1;
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        softDeleted,
        purged,
        demoPurged,
        suspended_purge_days: suspendedDays,
        deleted_purge_days: deletedDays,
        notes,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

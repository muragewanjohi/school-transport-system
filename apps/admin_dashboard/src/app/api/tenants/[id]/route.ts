import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { removeTenantSubdomain } from "@/lib/vercelDomains";

const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  domain: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  status: z.enum(["active", "suspended"]).optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().nullable(),
  campus_name: z.string().min(2).optional(),
  campus_latitude: z.number().min(-90).max(90).optional(),
  campus_longitude: z.number().min(-180).max(180).optional(),
  campus_monthly_fee_kes: z.number().int().min(0).optional(),
  is_paid: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          id,
          name: "Mock School",
          domain: "mock-school",
          status: "active",
          campus_monthly_fee_kes: 10000,
          active_campus_count: 1,
          platform_fee_kes: 10000,
        },
      });
    }

    const caller = await getCallerProfile(_request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const { data: tenant, error } = await adminClient
      .from("tenants")
      .select("id, name, domain, status, deleted_at, contact_email, contact_phone, created_at, updated_at")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: "School not found" }, { status: 404 });
    }

    const { data: campuses } = await adminClient
      .from("campuses")
      .select("id, name, latitude, longitude, status")
      .eq("tenant_id", id)
      .is("deleted_at", null);

    const { data: billing } = await adminClient
      .from("billing_status")
      .select("campus_monthly_fee_kes, is_paid, plan_name, next_renewal")
      .eq("tenant_id", id)
      .maybeSingle();

    const fee = billing?.campus_monthly_fee_kes ?? 10000;
    const activeCampusCount = campuses?.length ?? 0;
    const primary = campuses?.[0] ?? null;

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        ...tenant,
        campus: primary,
        campuses: campuses ?? [],
        campus_monthly_fee_kes: fee,
        active_campus_count: activeCampusCount,
        platform_fee_kes: activeCampusCount * fee,
        is_paid: billing?.is_paid ?? false,
        plan_name: billing?.plan_name ?? "Pro",
        next_renewal: billing?.next_renewal ?? null,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const parsed = updateSchoolSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { id, ...parsed.data },
      });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const input = parsed.data;
    const tenantPatch: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) tenantPatch.name = input.name;
    if (input.domain !== undefined) tenantPatch.domain = input.domain;
    if (input.status !== undefined) {
      tenantPatch.status = input.status;
      // Start/stop the suspension retention clock only on actual transitions
      const { data: current } = await adminClient
        .from("tenants")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (current && current.status !== input.status) {
        tenantPatch.suspended_at = input.status === "suspended" ? new Date().toISOString() : null;
      }
    }
    if (input.contact_email !== undefined) tenantPatch.contact_email = input.contact_email || null;
    if (input.contact_phone !== undefined) tenantPatch.contact_phone = input.contact_phone;

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .update(tenantPatch)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, name, domain, status, deleted_at, contact_email, contact_phone, created_at")
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: tenantError?.message || "School not found" },
        { status: 404 }
      );
    }

    if (
      input.campus_name !== undefined ||
      input.campus_latitude !== undefined ||
      input.campus_longitude !== undefined
    ) {
      const { data: existingCampus } = await adminClient
        .from("campuses")
        .select("id, latitude, longitude")
        .eq("tenant_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingCampus) {
        const lat = input.campus_latitude ?? existingCampus.latitude ?? -1.2921;
        const lng = input.campus_longitude ?? existingCampus.longitude ?? 36.8219;
        const campusUpdate: Record<string, string | number> = {
          updated_at: new Date().toISOString(),
        };
        if (input.campus_name !== undefined) campusUpdate.name = input.campus_name;
        if (input.campus_latitude !== undefined || input.campus_longitude !== undefined) {
          campusUpdate.latitude = lat;
          campusUpdate.longitude = lng;
          campusUpdate.location = `POINT(${lng} ${lat})`;
        }
        await adminClient.from("campuses").update(campusUpdate).eq("id", existingCampus.id);
      }
    }

    if (input.campus_monthly_fee_kes !== undefined || input.is_paid !== undefined) {
      const billingPatch: Record<string, string | number | boolean> = {
        tenant_id: id,
        updated_at: new Date().toISOString(),
      };
      if (input.campus_monthly_fee_kes !== undefined) {
        billingPatch.campus_monthly_fee_kes = input.campus_monthly_fee_kes;
        billingPatch.price_desc = `KES ${input.campus_monthly_fee_kes.toLocaleString()} / month per campus + SMS usage`;
      }
      if (input.is_paid !== undefined) {
        billingPatch.is_paid = input.is_paid;
      }
      await adminClient.from("billing_status").upsert(billingPatch, { onConflict: "tenant_id" });
    }

    if (input.name !== undefined) {
      await adminClient
        .from("tenant_configs")
        .update({ school_name: input.name, updated_at: new Date().toISOString() })
        .eq("tenant_id", id);
    }

    const { data: campuses } = await adminClient
      .from("campuses")
      .select("id, name, latitude, longitude")
      .eq("tenant_id", id)
      .is("deleted_at", null);

    const { data: billing } = await adminClient
      .from("billing_status")
      .select("campus_monthly_fee_kes")
      .eq("tenant_id", id)
      .maybeSingle();

    const fee = billing?.campus_monthly_fee_kes ?? 10000;
    const activeCampusCount = campuses?.length ?? 0;

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        ...tenant,
        campus: campuses?.[0] ?? null,
        campus_monthly_fee_kes: fee,
        active_campus_count: activeCampusCount,
        platform_fee_kes: activeCampusCount * fee,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, deleted: true } });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    // Capture the slug before it is renamed so we can release the Vercel domain
    const { data: existing } = await adminClient
      .from("tenants")
      .select("domain")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    const now = new Date().toISOString();
    const { data: tenant, error } = await adminClient
      .from("tenants")
      .update({
        deleted_at: now,
        status: "suspended",
        updated_at: now,
        // Free the domain for reuse while keeping audit trail
        domain: `deleted-${id.slice(0, 8)}-${Date.now()}`,
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error || !tenant) {
      return NextResponse.json({ success: false, error: error?.message || "School not found" }, { status: 404 });
    }

    await adminClient
      .from("campuses")
      .update({ deleted_at: now, status: "suspended", updated_at: now })
      .eq("tenant_id", id)
      .is("deleted_at", null);

    // Best-effort: release the subdomain from the Vercel project
    let vercelDetail: string | null = null;
    if (existing?.domain && !existing.domain.startsWith("deleted-")) {
      const vercel = await removeTenantSubdomain(existing.domain);
      vercelDetail = vercel.detail;
      if (!vercel.ok) {
        console.error(`Vercel domain cleanup for tenant ${id}: ${vercel.detail}`);
      }
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: { id, deleted: true, vercel: vercelDetail },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

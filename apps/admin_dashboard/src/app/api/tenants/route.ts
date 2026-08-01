import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getTenantPublicUrl } from "@/lib/tenantHost";
import { extractBearerToken, getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";

const createSchoolSchema = z.object({
  name: z.string().min(2, "School name must be at least 2 characters"),
  domain: z
    .string()
    .min(2, "Subdomain slug is required")
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug like school1 or acme-academy"),
  contact_email: z.string().email("Valid contact email required").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  campus_name: z.string().min(2).optional(),
  campus_latitude: z.number().min(-90).max(90).optional(),
  campus_longitude: z.number().min(-180).max(180).optional(),
  campus_monthly_fee_kes: z.number().int().min(0).optional(),
  admin_name: z.string().min(2, "Admin name is required"),
  admin_email: z.string().email("Valid admin invite email required"),
  admin_phone: z.string().optional(),
});

type MockSchool = {
  id: string;
  name: string;
  domain: string;
  status: "active" | "suspended";
  deleted_at: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  campus: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  };
  campus_monthly_fee_kes: number;
  platform_fee_kes: number;
  active_campus_count: number;
  students_count: number;
  vehicles_count: number;
  routes_count: number;
  drivers_count: number;
  is_paid: boolean;
  plan_name: string;
  next_renewal: string | null;
  sms_used_this_month: number;
  invite_status?: string;
};

const mockSchools: MockSchool[] = [
  {
    id: "8c9ad841-f762-4217-a021-9876251b5bcf",
    name: "Safaricom Track School",
    domain: "safaricom-track",
    status: "active",
    deleted_at: null,
    contact_email: "admin@safaricom-track.school",
    contact_phone: "+254 700 000 000",
    created_at: new Date().toISOString(),
    campus: {
      id: "campus-mock-1",
      name: "Safaricom Track School Campus",
      latitude: -1.2921,
      longitude: 36.8219,
    },
    campus_monthly_fee_kes: 10000,
    platform_fee_kes: 10000,
    active_campus_count: 1,
    students_count: 0,
    vehicles_count: 0,
    routes_count: 0,
    drivers_count: 0,
    is_paid: false,
    plan_name: "Pro",
    next_renewal: null,
    sms_used_this_month: 0,
  },
];

async function getDefaultCampusFee(adminClient: NonNullable<ReturnType<typeof getServiceSupabaseClient>>): Promise<number> {
  const { data } = await adminClient
    .from("platform_settings")
    .select("value")
    .eq("key", "default_campus_monthly_fee_kes")
    .maybeSingle();

  const raw = data?.value;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10000;
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: mockSchools });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const token = extractBearerToken(request);
    const client = getSupabaseClient(token);
    const adminClient = getServiceSupabaseClient() ?? client;

    const { data: tenants, error } = await adminClient
      .from("tenants")
      .select("id, name, domain, status, deleted_at, contact_email, contact_phone, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tenantIds = (tenants ?? []).map((t) => t.id);
    const campusesByTenant = new Map<string, { id: string; name: string; latitude: number | null; longitude: number | null }[]>();
    const billingByTenant = new Map<
      string,
      {
        campus_monthly_fee_kes: number;
        is_paid: boolean;
        plan_name: string;
        next_renewal: string | null;
        sms_used_this_month: number;
      }
    >();
    const studentsByTenant = new Map<string, number>();
    const vehiclesByTenant = new Map<string, number>();
    const routesByTenant = new Map<string, number>();
    const driversByTenant = new Map<string, number>();

    if (tenantIds.length > 0) {
      const [campusRes, billingRes, studentRes, vehicleRes, routeRes, driverRes] = await Promise.all([
        adminClient
          .from("campuses")
          .select("id, tenant_id, name, latitude, longitude")
          .in("tenant_id", tenantIds)
          .is("deleted_at", null),
        adminClient
          .from("billing_status")
          .select("tenant_id, campus_monthly_fee_kes, is_paid, plan_name, next_renewal, sms_used_this_month")
          .in("tenant_id", tenantIds),
        adminClient.from("students").select("tenant_id").in("tenant_id", tenantIds),
        adminClient.from("vehicles").select("tenant_id").in("tenant_id", tenantIds),
        adminClient.from("routes").select("tenant_id").in("tenant_id", tenantIds),
        adminClient.from("profiles").select("tenant_id").eq("role", "driver").in("tenant_id", tenantIds),
      ]);

      for (const campus of campusRes.data ?? []) {
        const list = campusesByTenant.get(campus.tenant_id) ?? [];
        list.push({
          id: campus.id,
          name: campus.name,
          latitude: campus.latitude,
          longitude: campus.longitude,
        });
        campusesByTenant.set(campus.tenant_id, list);
      }

      for (const row of billingRes.data ?? []) {
        billingByTenant.set(row.tenant_id, {
          campus_monthly_fee_kes: row.campus_monthly_fee_kes ?? 10000,
          is_paid: row.is_paid ?? false,
          plan_name: row.plan_name ?? "Pro",
          next_renewal: row.next_renewal ?? null,
          sms_used_this_month: row.sms_used_this_month ?? 0,
        });
      }

      const tally = (rows: { tenant_id: string }[] | null, map: Map<string, number>) => {
        for (const row of rows ?? []) {
          map.set(row.tenant_id, (map.get(row.tenant_id) ?? 0) + 1);
        }
      };
      tally(studentRes.data, studentsByTenant);
      tally(vehicleRes.data, vehiclesByTenant);
      tally(routeRes.data, routesByTenant);
      tally(driverRes.data, driversByTenant);
    }

    const data = (tenants ?? []).map((tenant) => {
      const campuses = campusesByTenant.get(tenant.id) ?? [];
      const billing = billingByTenant.get(tenant.id);
      const fee = billing?.campus_monthly_fee_kes ?? 10000;
      const activeCampusCount = campuses.length;
      const primary = campuses[0] ?? null;

      return {
        ...tenant,
        campus: primary
          ? {
              id: primary.id,
              name: primary.name,
              latitude: primary.latitude ?? -1.2921,
              longitude: primary.longitude ?? 36.8219,
            }
          : null,
        campus_monthly_fee_kes: fee,
        active_campus_count: activeCampusCount,
        platform_fee_kes: activeCampusCount * fee,
        students_count: studentsByTenant.get(tenant.id) ?? 0,
        vehicles_count: vehiclesByTenant.get(tenant.id) ?? 0,
        routes_count: routesByTenant.get(tenant.id) ?? 0,
        drivers_count: driversByTenant.get(tenant.id) ?? 0,
        is_paid: billing?.is_paid ?? false,
        plan_name: billing?.plan_name ?? "Pro",
        next_renewal: billing?.next_renewal ?? null,
        sms_used_this_month: billing?.sms_used_this_month ?? 0,
      };
    });

    return NextResponse.json({ success: true, source: "supabase", data });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = createSchoolSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    if (!isSupabaseConfigured) {
      const mock: MockSchool = {
        id: crypto.randomUUID(),
        name: input.name,
        domain: input.domain,
        status: "active",
        deleted_at: null,
        contact_email: input.contact_email || null,
        contact_phone: input.contact_phone || null,
        created_at: new Date().toISOString(),
        campus: {
          id: crypto.randomUUID(),
          name: input.campus_name || `${input.name} Campus`,
          latitude: input.campus_latitude ?? -1.2921,
          longitude: input.campus_longitude ?? 36.8219,
        },
        campus_monthly_fee_kes: input.campus_monthly_fee_kes ?? 10000,
        platform_fee_kes: input.campus_monthly_fee_kes ?? 10000,
        active_campus_count: 1,
        students_count: 0,
        vehicles_count: 0,
        routes_count: 0,
        drivers_count: 0,
        is_paid: false,
        plan_name: "Pro",
        next_renewal: null,
        sms_used_this_month: 0,
        invite_status: "mock_invite_queued",
      };
      mockSchools.unshift(mock);
      return NextResponse.json({ success: true, source: "mock", data: mock });
    }

    const caller = await getCallerProfile(request);
    if (!isPlatformSuperAdmin(caller)) {
      return NextResponse.json({ success: false, error: "Platform super admin required" }, { status: 403 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          success: false,
          error: "SUPABASE_SERVICE_ROLE_KEY is required on the server to onboard schools and send invites",
        },
        { status: 500 }
      );
    }

    const defaultFee = await getDefaultCampusFee(adminClient);
    const fee = input.campus_monthly_fee_kes ?? defaultFee;
    const lat = input.campus_latitude ?? -1.2921;
    const lng = input.campus_longitude ?? 36.8219;
    const campusName = input.campus_name || `${input.name} Campus`;

    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .insert({
        name: input.name,
        domain: input.domain,
        status: "active",
        contact_email: input.contact_email || input.admin_email,
        contact_phone: input.contact_phone || input.admin_phone || null,
      })
      .select("id, name, domain, status, deleted_at, contact_email, contact_phone, created_at")
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { success: false, error: tenantError?.message || "Failed to create school" },
        { status: 400 }
      );
    }

    const { data: campus, error: campusError } = await adminClient
      .from("campuses")
      .insert({
        tenant_id: tenant.id,
        name: campusName,
        latitude: lat,
        longitude: lng,
        location: `POINT(${lng} ${lat})`,
        status: "active",
      })
      .select("id, name, latitude, longitude")
      .single();

    if (campusError || !campus) {
      await adminClient.from("tenants").update({ deleted_at: new Date().toISOString(), status: "suspended" }).eq("id", tenant.id);
      return NextResponse.json(
        { success: false, error: campusError?.message || "Failed to create campus" },
        { status: 500 }
      );
    }

    await adminClient.from("billing_status").upsert(
      {
        tenant_id: tenant.id,
        plan_name: "Pro",
        price_desc: `KES ${fee.toLocaleString()} / month per campus + SMS usage`,
        is_paid: false,
        campus_monthly_fee_kes: fee,
        students_count: 0,
        active_routes_count: 0,
        drivers_count: 0,
        sms_used_this_month: 0,
      },
      { onConflict: "tenant_id" }
    );

    await adminClient.from("tenant_configs").upsert(
      {
        tenant_id: tenant.id,
        school_name: input.name,
        school_phone: input.contact_phone || input.admin_phone || null,
        school_email: input.contact_email || input.admin_email,
        school_address: campusName,
      },
      { onConflict: "tenant_id" }
    );

    const siteUrl = getTenantPublicUrl(input.domain, "/reset-password");
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      input.admin_email,
      {
        redirectTo: siteUrl,
        data: {
          name: input.admin_name,
          phone: input.admin_phone || null,
          role: "school_admin",
          admin_role: "Super Admin",
          tenant_id: tenant.id,
        },
      }
    );

    if (inviteError) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        warning: `School created but invite failed: ${inviteError.message}`,
        data: {
          ...tenant,
          campus: {
            id: campus.id,
            name: campus.name,
            latitude: campus.latitude,
            longitude: campus.longitude,
          },
          campus_monthly_fee_kes: fee,
          active_campus_count: 1,
          platform_fee_kes: fee,
          students_count: 0,
          invite_status: "failed",
        },
      });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        ...tenant,
        campus: {
          id: campus.id,
          name: campus.name,
          latitude: campus.latitude,
          longitude: campus.longitude,
        },
        campus_monthly_fee_kes: fee,
        active_campus_count: 1,
        platform_fee_kes: fee,
        students_count: 0,
        invite_status: "sent",
        invited_user_id: inviteData.user?.id ?? null,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

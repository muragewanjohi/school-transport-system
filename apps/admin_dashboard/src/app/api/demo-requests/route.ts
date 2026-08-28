import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import { hashIp } from "@/lib/demoSchool";
import { demoInboxBadgeCount } from "@/lib/demoGoLive";
import {
  DEMO_DEFAULT_EXPIRY_DAYS,
  extendDemoOtpExpiry,
  provisionDemoStore,
  purgeDemoTenant,
  resetDemoAccessCredentials,
  type DemoProvisionResult,
} from "@/lib/demoProvision";
import {
  notifyDemoReady,
  notifyRequesterCompleted,
  notifyRequesterReceived,
  notifySales,
} from "@/lib/demoRequestEmails";

const demoRequestSchema = z.object({
  full_name: z.string().min(2, "Name is required").max(120),
  role: z.enum(["Transport Manager", "School Admin", "Principal", "Other"]),
  school_name: z.string().min(2, "School name is required").max(160),
  country: z.string().min(2, "Country is required").max(120),
  city: z.string().min(2, "City / area is required").max(120),
  phone: z
    .string()
    .min(10, "WhatsApp or phone is required")
    .max(40)
    .regex(/^\+\d{8,18}$/, "Phone must include a country code, e.g. +254712345678"),
  email: z.string().min(1, "Work email is required").email("Valid work email required"),
  fleet_size: z.enum(["1-5", "6-15", "16+"]),
  preferred_time: z.enum(["ASAP", "This week", "Next week"]),
  notes: z.string().max(1000).optional().or(z.literal("")),
  /** Honeypot — must stay empty */
  company_website: z.string().max(0).optional().or(z.literal("")),
});

const demoRequestStatusSchema = z.enum(["pending", "confirmed", "completed", "declined"]);

const updateDemoRequestSchema = z.object({
  id: z.string().uuid(),
  status: demoRequestStatusSchema.optional(),
  action: z.enum(["resend_access_email"]).optional(),
  demo_expires_at: z.string().datetime().optional(),
  fields: z
    .object({
      full_name: z.string().min(2).max(120).optional(),
      role: z.enum(["Transport Manager", "School Admin", "Principal", "Other"]).optional(),
      school_name: z.string().min(2).max(160).optional(),
      country: z.string().min(2).max(120).optional(),
      city: z.string().min(2).max(120).optional(),
      phone: z
        .string()
        .min(10)
        .max(40)
        .regex(/^\+\d{8,18}$/)
        .optional(),
      email: z.string().email().optional(),
      fleet_size: z.enum(["1-5", "6-15", "16+"]).optional(),
      preferred_time: z.enum(["ASAP", "This week", "Next week"]).optional(),
      notes: z.string().max(1000).optional().nullable(),
    })
    .optional(),
});

const rateBucket = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

function allowRequest(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 8;
  const entry = rateBucket.get(ip);
  if (!entry || entry.resetAt < now) {
    rateBucket.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

const DEMO_REQUEST_SELECT =
  "id, full_name, role, school_name, country, city, phone, email, fleet_size, preferred_time, notes, status, reviewed_at, created_at, provisioned_tenant_id, go_live_requested_at";

function credentialsPayload(provision: DemoProvisionResult) {
  return {
    school_url: provision.schoolUrl,
    admin_email: provision.adminEmail,
    admin_password: provision.adminPassword,
    phone: provision.phone,
    otp: provision.otp,
    expires_at: provision.expiresAt,
    slug: provision.slug,
  };
}
export async function GET(request: Request) {
  try {
    const caller = await getCallerProfile(request);
    if (!caller || !isPlatformSuperAdmin(caller)) {
      return NextResponse.json(
        { success: false, error: "Platform super admin required" },
        { status: 403 }
      );
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get("summary") === "1") {
      const { data: summaryRows, error } = await adminClient
        .from("demo_requests")
        .select("status")
        .in("status", ["pending", "ready_to_onboard"]);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      const pendingCount = (summaryRows ?? []).filter((row) => row.status === "pending").length;
      const readyToOnboardCount = (summaryRows ?? []).filter(
        (row) => row.status === "ready_to_onboard"
      ).length;

      return NextResponse.json({
        success: true,
        data: {
          pending_count: pendingCount,
          ready_to_onboard_count: readyToOnboardCount,
          attention_count: demoInboxBadgeCount(pendingCount),
        },
      });
    }

    const singleId = searchParams.get("id");
    if (singleId) {
      const { data: row, error } = await adminClient
        .from("demo_requests")
        .select(DEMO_REQUEST_SELECT)
        .eq("id", singleId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ success: false, error: "Demo request not found" }, { status: 404 });
      }

      let demo_slug: string | null = null;
      let demo_expires_at: string | null = null;
      let demo_school_url: string | null = null;
      if (row.provisioned_tenant_id) {
        const { data: tenant } = await adminClient
          .from("tenants")
          .select("domain, demo_expires_at")
          .eq("id", row.provisioned_tenant_id)
          .maybeSingle();
        if (tenant?.domain) {
          demo_slug = tenant.domain;
          demo_expires_at = tenant.demo_expires_at;
          demo_school_url = `https://${tenant.domain}.onthebusapp.com/login`;
        }
      }

      return NextResponse.json({
        success: true,
        data: { ...row, demo_slug, demo_expires_at, demo_school_url },
      });
    }

    const { data, error } = await adminClient
      .from("demo_requests")
      .select(DEMO_REQUEST_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const tenantIds = rows
      .map((r) => r.provisioned_tenant_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const tenantMeta = new Map<
      string,
      { domain: string; demo_expires_at: string | null; name: string }
    >();

    if (tenantIds.length > 0) {
      const { data: tenants } = await adminClient
        .from("tenants")
        .select("id, domain, demo_expires_at, name")
        .in("id", tenantIds);
      for (const t of tenants ?? []) {
        tenantMeta.set(t.id, {
          domain: t.domain,
          demo_expires_at: t.demo_expires_at,
          name: t.name,
        });
      }
    }

    const enriched = rows.map((row) => {
      const meta = row.provisioned_tenant_id
        ? tenantMeta.get(row.provisioned_tenant_id)
        : undefined;
      return {
        ...row,
        demo_slug: meta?.domain ?? null,
        demo_expires_at: meta?.demo_expires_at ?? null,
        demo_school_url: meta?.domain ? `https://${meta.domain}.onthebusapp.com/login` : null,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const caller = await getCallerProfile(request);
    if (!caller || !isPlatformSuperAdmin(caller)) {
      return NextResponse.json(
        { success: false, error: "Platform super admin required" },
        { status: 403 }
      );
    }

    const body: unknown = await request.json();
    const parsed = updateDemoRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid update" },
        { status: 400 }
      );
    }

    if (!parsed.data.status && !parsed.data.demo_expires_at && !parsed.data.fields && !parsed.data.action) {
      return NextResponse.json(
        { success: false, error: "Provide status, action, demo_expires_at, and/or fields" },
        { status: 400 }
      );
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const { data: existing, error: existingError } = await adminClient
      .from("demo_requests")
      .select(
        "id, full_name, email, school_name, country, city, phone, status, provisioned_tenant_id"
      )
      .eq("id", parsed.data.id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { success: false, error: existingError?.message || "Demo request not found" },
        { status: 404 }
      );
    }

    // Resend access details to the requester (confirmed / ready_to_onboard + provisioned)
    if (parsed.data.action === "resend_access_email") {
      if (
        (existing.status !== "confirmed" && existing.status !== "ready_to_onboard") ||
        !existing.provisioned_tenant_id
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Access email can only be resent for a confirmed, provisioned demo store",
          },
          { status: 400 }
        );
      }
      if (!existing.email) {
        return NextResponse.json(
          { success: false, error: "Demo request is missing requester email" },
          { status: 400 }
        );
      }

      const reset = await resetDemoAccessCredentials(adminClient, existing.provisioned_tenant_id);
      if ("error" in reset) {
        return NextResponse.json({ success: false, error: reset.error }, { status: 500 });
      }

      const provisionEmailSent = await notifyDemoReady({
        ...reset,
        fullName: existing.full_name,
        email: existing.email,
        schoolName: existing.school_name,
      });

      const { data: refreshed } = await adminClient
        .from("demo_requests")
        .select(DEMO_REQUEST_SELECT)
        .eq("id", existing.id)
        .single();

      return NextResponse.json({
        success: true,
        data: {
          ...refreshed,
          demo_slug: reset.slug,
          demo_expires_at: reset.expiresAt,
          demo_school_url: reset.schoolUrl,
        },
        provision_email_sent: provisionEmailSent,
        demo_school_url: reset.schoolUrl,
        credentials: credentialsPayload(reset),
      });
    }

    // Field edits (pending requests only)
    if (parsed.data.fields && !parsed.data.status) {
      if (existing.status !== "pending") {
        return NextResponse.json(
          { success: false, error: "Only pending demo requests can be edited" },
          { status: 400 }
        );
      }
      const fields = parsed.data.fields;
      const { data: updated, error: updateError } = await adminClient
        .from("demo_requests")
        .update({
          ...(fields.full_name !== undefined ? { full_name: fields.full_name } : {}),
          ...(fields.role !== undefined ? { role: fields.role } : {}),
          ...(fields.school_name !== undefined ? { school_name: fields.school_name } : {}),
          ...(fields.country !== undefined ? { country: fields.country } : {}),
          ...(fields.city !== undefined ? { city: fields.city } : {}),
          ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
          ...(fields.email !== undefined ? { email: fields.email } : {}),
          ...(fields.fleet_size !== undefined ? { fleet_size: fields.fleet_size } : {}),
          ...(fields.preferred_time !== undefined ? { preferred_time: fields.preferred_time } : {}),
          ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
        })
        .eq("id", existing.id)
        .select(DEMO_REQUEST_SELECT)
        .single();

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // Expiry-only update
    if (parsed.data.demo_expires_at && !parsed.data.status) {
      if (!existing.provisioned_tenant_id) {
        return NextResponse.json(
          { success: false, error: "No provisioned demo store to update expiry for" },
          { status: 400 }
        );
      }
      if (
        existing.status !== "confirmed" &&
        existing.status !== "ready_to_onboard"
      ) {
        return NextResponse.json(
          { success: false, error: "Expiry can only be extended while the demo store is active" },
          { status: 400 }
        );
      }
      const nextExpiry = new Date(parsed.data.demo_expires_at);
      if (Number.isNaN(nextExpiry.getTime()) || nextExpiry.getTime() <= Date.now()) {
        return NextResponse.json(
          { success: false, error: "Expiry must be a future date" },
          { status: 400 }
        );
      }
      const { error: expError } = await adminClient
        .from("tenants")
        .update({ demo_expires_at: parsed.data.demo_expires_at })
        .eq("id", existing.provisioned_tenant_id)
        .eq("is_demo", true);
      if (expError) {
        return NextResponse.json({ success: false, error: expError.message }, { status: 500 });
      }
      await extendDemoOtpExpiry(
        adminClient,
        existing.provisioned_tenant_id,
        parsed.data.demo_expires_at
      );

      const { data: refreshed } = await adminClient
        .from("demo_requests")
        .select(DEMO_REQUEST_SELECT)
        .eq("id", existing.id)
        .single();

      return NextResponse.json({
        success: true,
        data: {
          ...refreshed,
          demo_expires_at: parsed.data.demo_expires_at,
        },
      });
    }

    const nextStatus = parsed.data.status;
    if (!nextStatus) {
      return NextResponse.json({ success: false, error: "Status required" }, { status: 400 });
    }

    let provision: DemoProvisionResult | null = null;
    let provisionEmailSent = false;
    let completionEmailSent = false;

    if (nextStatus === "confirmed" && existing.status === "pending") {
      if (!existing.email || !existing.phone) {
        return NextResponse.json(
          { success: false, error: "Demo request is missing email or phone" },
          { status: 400 }
        );
      }

      const expiresAt =
        parsed.data.demo_expires_at ||
        new Date(Date.now() + DEMO_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const issued = await provisionDemoStore({
        demoRequestId: existing.id,
        schoolName: existing.school_name,
        fullName: existing.full_name,
        email: existing.email,
        phone: existing.phone,
        city: existing.city || "Nairobi",
        country: existing.country || "Kenya",
        expiresAt,
      });

      if ("error" in issued) {
        return NextResponse.json({ success: false, error: issued.error }, { status: 500 });
      }

      provision = issued;
      provisionEmailSent = await notifyDemoReady({
        ...issued,
        fullName: existing.full_name,
        email: existing.email,
        schoolName: existing.school_name,
      });
    }

    if (
      (nextStatus === "completed" || nextStatus === "declined") &&
      existing.provisioned_tenant_id
    ) {
      const purged = await purgeDemoTenant(adminClient, existing.provisioned_tenant_id);
      if (!purged.ok) {
        return NextResponse.json(
          { success: false, error: purged.detail || "Failed to remove demo store" },
          { status: 500 }
        );
      }
    }

    if (
      nextStatus === "completed" &&
      (existing.status === "confirmed" || existing.status === "ready_to_onboard") &&
      existing.email
    ) {
      completionEmailSent = await notifyRequesterCompleted({
        fullName: existing.full_name,
        email: existing.email,
        schoolName: existing.school_name,
      });
    }

    const { data, error } = await adminClient
      .from("demo_requests")
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: caller.id,
        ...(nextStatus === "completed" || nextStatus === "declined"
          ? { provisioned_tenant_id: null }
          : {}),
      })
      .eq("id", parsed.data.id)
      .select(DEMO_REQUEST_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        demo_slug: provision?.slug ?? null,
        demo_expires_at: provision?.expiresAt ?? null,
        demo_school_url: provision?.schoolUrl ?? null,
      },
      provision_email_sent: provisionEmailSent,
      demo_school_url: provision?.schoolUrl ?? null,
      completion_email_sent: completionEmailSent,
      credentials: provision ? credentialsPayload(provision) : null,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (!allowRequest(ip)) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const json: unknown = await request.json();
    const parsed = demoRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid form data" },
        { status: 400 }
      );
    }

    if (parsed.data.company_website) {
      return NextResponse.json({ success: true, data: { id: "honeypot" } });
    }

    const {
      full_name,
      role,
      school_name,
      country,
      city,
      phone,
      email,
      fleet_size,
      preferred_time,
      notes,
    } = parsed.data;

    if (!isSupabaseConfigured) {
      await Promise.all([
        notifyRequesterReceived({
          full_name,
          school_name,
          email,
          preferred_time,
        }),
        notifySales({
          full_name,
          role,
          school_name,
          country,
          city,
          phone,
          email,
          fleet_size,
          preferred_time,
          notes: notes || undefined,
        }),
      ]);
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { id: "mock-demo-request" },
      });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const { data: lead, error: leadError } = await adminClient
      .from("demo_requests")
      .insert({
        full_name,
        role,
        school_name,
        country,
        city,
        phone,
        email: email || null,
        fleet_size,
        preferred_time,
        notes: notes || null,
        ip_hash: hashIp(ip),
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { success: false, error: leadError?.message || "Failed to save request" },
        { status: 500 }
      );
    }

    const [receiptEmailSent] = await Promise.all([
      notifyRequesterReceived({
        full_name,
        school_name,
        email,
        preferred_time,
      }),
      notifySales({
        full_name,
        role,
        school_name,
        country,
        city,
        phone,
        email,
        fleet_size,
        preferred_time,
        notes: notes || undefined,
      }),
    ]);

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: { id: lead.id },
      receipt_email_sent: receiptEmailSent,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import {
  demoReadonlyForbiddenResponse,
  getCallerProfile,
  isDemoReadonly,
} from "@/lib/authApi";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import {
  DEMO_GO_LIVE_STATUS,
  canRequestGoLive,
  formatDemoExpiryLabel,
} from "@/lib/demoGoLive";
import { notifyGoLiveRequested } from "@/lib/demoRequestEmails";

type TenantGoLiveRow = {
  id: string;
  name: string;
  domain: string;
  is_demo: boolean;
  demo_expires_at: string | null;
  demo_request_id: string | null;
};

type DemoRequestGoLiveRow = {
  id: string;
  status: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  school_name: string;
};

function emptyPaidResponse() {
  return NextResponse.json({
    success: true,
    data: {
      is_demo: false,
      slug: null,
      school_name: null,
      demo_expires_at: null,
      demo_expiry_label: null,
      demo_request_status: null,
      can_request_go_live: false,
      go_live_requested: false,
    },
  });
}

async function loadTenantGoLive(
  tenantId: string
): Promise<
  | { ok: true; tenant: TenantGoLiveRow; request: DemoRequestGoLiveRow | null }
  | { ok: false; status: number; error: string }
> {
  const adminClient = getServiceSupabaseClient();
  if (!adminClient) {
    return { ok: false, status: 500, error: "Service unavailable" };
  }

  const { data: tenant, error: tenantError } = await adminClient
    .from("tenants")
    .select("id, name, domain, is_demo, demo_expires_at, demo_request_id")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tenantError) {
    return { ok: false, status: 500, error: tenantError.message };
  }
  if (!tenant) {
    return { ok: false, status: 404, error: "School not found" };
  }

  let request: DemoRequestGoLiveRow | null = null;
  if (tenant.demo_request_id) {
    const { data: requestRow, error: requestError } = await adminClient
      .from("demo_requests")
      .select("id, status, full_name, email, phone, city, school_name")
      .eq("id", tenant.demo_request_id)
      .maybeSingle();
    if (requestError) {
      return { ok: false, status: 500, error: requestError.message };
    }
    request = requestRow;
  }

  return { ok: true, tenant, request };
}

function goLivePayload(tenant: TenantGoLiveRow, request: DemoRequestGoLiveRow | null) {
  const eligibility = canRequestGoLive({
    isDemo: tenant.is_demo,
    domain: tenant.domain,
    demoRequestId: tenant.demo_request_id,
    requestStatus: request?.status ?? null,
  });
  const goLiveRequested = request?.status === DEMO_GO_LIVE_STATUS;
  return {
    is_demo: tenant.is_demo,
    slug: tenant.domain,
    school_name: tenant.name,
    demo_expires_at: tenant.demo_expires_at,
    demo_expiry_label: tenant.is_demo ? formatDemoExpiryLabel(tenant.demo_expires_at) : null,
    demo_request_status: request?.status ?? null,
    can_request_go_live: eligibility.ok,
    go_live_requested: goLiveRequested,
  };
}

export async function GET(request: Request) {
  try {
    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const caller = await getCallerProfile(request);
    if (!caller || caller.role !== "school_admin") {
      return NextResponse.json(
        { success: false, error: "School administrator required" },
        { status: 403 }
      );
    }

    const loaded = await loadTenantGoLive(scope.tenantId);
    if (!loaded.ok) {
      return NextResponse.json(
        { success: false, error: loaded.error },
        { status: loaded.status }
      );
    }

    if (!loaded.tenant.is_demo) {
      return emptyPaidResponse();
    }

    return NextResponse.json({
      success: true,
      data: goLivePayload(loaded.tenant, loaded.request),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const caller = await getCallerProfile(request);
    if (!caller || caller.role !== "school_admin") {
      return NextResponse.json(
        { success: false, error: "School administrator required" },
        { status: 403 }
      );
    }
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const loaded = await loadTenantGoLive(scope.tenantId);
    if (!loaded.ok) {
      return NextResponse.json(
        { success: false, error: loaded.error },
        { status: loaded.status }
      );
    }

    const eligibility = canRequestGoLive({
      isDemo: loaded.tenant.is_demo,
      domain: loaded.tenant.domain,
      demoRequestId: loaded.tenant.demo_request_id,
      requestStatus: loaded.request?.status ?? null,
    });

    if (eligibility.alreadyRequested) {
      return NextResponse.json({
        success: true,
        already_requested: true,
        data: goLivePayload(loaded.tenant, loaded.request),
      });
    }

    if (!eligibility.ok) {
      return NextResponse.json({ success: false, error: eligibility.reason }, { status: 400 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient || !loaded.request) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const requestedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await adminClient
      .from("demo_requests")
      .update({
        status: DEMO_GO_LIVE_STATUS,
        go_live_requested_at: requestedAt,
        go_live_requested_by: caller.id,
      })
      .eq("id", loaded.request.id)
      .eq("status", "confirmed")
      .select("id, status, full_name, email, phone, city, school_name")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Demo request could not be updated. Refresh and try again." },
        { status: 409 }
      );
    }

    const emailSent = await notifyGoLiveRequested({
      schoolName: updated.school_name || loaded.tenant.name,
      slug: loaded.tenant.domain,
      tenantId: loaded.tenant.id,
      demoExpiresAt: loaded.tenant.demo_expires_at,
      leadName: updated.full_name,
      leadEmail: updated.email,
      leadPhone: updated.phone,
      leadCity: updated.city,
      requestedByName: caller.name,
      requestedByEmail: caller.email,
    });

    console.info("[demo-go-live] Request marked ready to onboard", {
      tenantId: loaded.tenant.id,
      slug: loaded.tenant.domain,
      requestId: updated.id,
      emailSent,
    });

    return NextResponse.json({
      success: true,
      already_requested: false,
      email_sent: emailSent,
      data: goLivePayload(loaded.tenant, updated),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

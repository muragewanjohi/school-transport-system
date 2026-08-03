import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getTenantPublicUrl } from "@/lib/tenantHost";
import {
  createRawDemoToken,
  DEMO_TENANT_ID,
  DEMO_VIEWER_ADMIN_ROLE,
  DEMO_VIEWER_EMAIL,
  hashDemoToken,
} from "@/lib/demoSchool";

const exploreSchema = z.object({
  token: z.string().min(20, "Invalid explore token"),
});

async function ensureDemoViewer(
  adminClient: NonNullable<ReturnType<typeof getServiceSupabaseClient>>
): Promise<{ userId: string; password: string }> {
  const password = `${createRawDemoToken()}Aa1!`;

  const { data: listed } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed?.users?.find(
    (u) => u.email?.toLowerCase() === DEMO_VIEWER_EMAIL.toLowerCase()
  );

  if (existing) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        role: "school_admin",
        tenant_id: DEMO_TENANT_ID,
        name: "Demo Viewer",
        admin_role: DEMO_VIEWER_ADMIN_ROLE,
      },
      app_metadata: {
        role: "school_admin",
        tenant_id: DEMO_TENANT_ID,
        admin_role: DEMO_VIEWER_ADMIN_ROLE,
      },
    });
    if (updateError) {
      throw new Error(updateError.message);
    }

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: existing.id,
      tenant_id: DEMO_TENANT_ID,
      role: "school_admin",
      admin_role: DEMO_VIEWER_ADMIN_ROLE,
      name: "Demo Viewer",
      email: DEMO_VIEWER_EMAIL,
      phone: null,
    });
    if (profileError) {
      throw new Error(profileError.message);
    }

    return { userId: existing.id, password };
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: DEMO_VIEWER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      role: "school_admin",
      tenant_id: DEMO_TENANT_ID,
      name: "Demo Viewer",
      admin_role: DEMO_VIEWER_ADMIN_ROLE,
    },
    app_metadata: {
      role: "school_admin",
      tenant_id: DEMO_TENANT_ID,
      admin_role: DEMO_VIEWER_ADMIN_ROLE,
    },
  });

  if (createError || !created.user) {
    throw new Error(createError?.message || "Failed to create demo viewer");
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: created.user.id,
    tenant_id: DEMO_TENANT_ID,
    role: "school_admin",
    admin_role: DEMO_VIEWER_ADMIN_ROLE,
    name: "Demo Viewer",
    email: DEMO_VIEWER_EMAIL,
    phone: null,
  });
  if (profileError) {
    throw new Error(profileError.message);
  }

  return { userId: created.user.id, password };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = exploreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid token" },
        { status: 400 }
      );
    }

    const redirectUrl = getTenantPublicUrl("demo", "/dashboard");

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          email: DEMO_VIEWER_EMAIL,
          password: "demo-mock-password",
          redirect_url: redirectUrl,
          expires_note: "Mock explore session",
        },
      });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service unavailable" }, { status: 500 });
    }

    const tokenHash = hashDemoToken(parsed.data.token);
    const { data: access, error: accessError } = await adminClient
      .from("demo_access_tokens")
      .select("id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (accessError) {
      return NextResponse.json({ success: false, error: accessError.message }, { status: 500 });
    }

    if (!access) {
      return NextResponse.json(
        { success: false, error: "Explore link is invalid or has expired." },
        { status: 403 }
      );
    }

    if (new Date(access.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "Explore link has expired. Submit a new demo request." },
        { status: 403 }
      );
    }

    // Confirm demo tenant exists
    const { data: demoTenant } = await adminClient
      .from("tenants")
      .select("id, domain, is_demo, status, deleted_at")
      .eq("id", DEMO_TENANT_ID)
      .maybeSingle();

    if (!demoTenant || !demoTenant.is_demo || demoTenant.deleted_at || demoTenant.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Demo school is not available yet. Our team will follow up." },
        { status: 503 }
      );
    }

    const { password } = await ensureDemoViewer(adminClient);

    await adminClient
      .from("demo_access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", access.id)
      .is("used_at", null);

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: {
        email: DEMO_VIEWER_EMAIL,
        password,
        redirect_url: redirectUrl,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

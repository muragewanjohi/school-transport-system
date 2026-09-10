import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { ensureParentAuthSession } from "@/lib/parentAuthSession";
import {
  PARENT_SESSION_REFRESH_GRACE_SECONDS,
  parentSessionFromRequest,
  signParentSession,
} from "@/lib/parentSession";

const bodySchema = z.object({
  bootstrap_supabase: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parent = parentSessionFromRequest(request, {
      expiredGraceSeconds: PARENT_SESSION_REFRESH_GRACE_SECONDS,
    });
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const bootstrap =
      parsed.data.bootstrap_supabase === true ||
      request.headers.get("x-bootstrap-supabase") === "1";

    const access_token = signParentSession({
      sub: parent.sub,
      tenant_id: parent.tenant_id,
    });

    if (!bootstrap) {
      return NextResponse.json({ success: true, access_token });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", access_token });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: true, access_token });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("id, phone, name, email")
      .eq("id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();

    try {
      const tokens = await ensureParentAuthSession(db, {
        profileId: parent.sub,
        tenantId: parent.tenant_id,
        name: typeof profile?.name === "string" ? profile.name : undefined,
        phone: typeof profile?.phone === "string" ? profile.phone : undefined,
        email: typeof profile?.email === "string" ? profile.email : undefined,
      });
      return NextResponse.json({
        success: true,
        access_token,
        supabase_refresh_token: tokens.supabase_refresh_token,
        supabase_access_token: tokens.supabase_access_token,
      });
    } catch (err) {
      console.error(
        "Parent Supabase Auth bootstrap on /api/auth/parent-refresh:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json({ success: true, access_token });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

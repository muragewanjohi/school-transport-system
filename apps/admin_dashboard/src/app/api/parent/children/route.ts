import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";
import { studentLinkedToParent } from "@/lib/parentChildren";
import { ensureParentAuthSession } from "@/lib/parentAuthSession";

const STUDENT_SELECT =
  "id, name, grade, class_name, address, route_id, status, guardians, avatar_url, transit_status, parent_id, tenant_id, pickup_stop_id, dropoff_stop_id, tenant:tenants(id, name), pickup_stop:stops!students_pickup_stop_id_fkey(id, name, location), dropoff_stop:stops!students_dropoff_stop_id_fkey(id, name, location), route:routes(id, name, schedules(id, name, departure_time, direction, days_of_week))";

type StudentRow = {
  id: string;
  parent_id: string | null;
  guardians?: unknown;
  tenant_id: string;
};

export async function GET(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", children: [] });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("id, phone, name, email")
      .eq("id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();

    const parentPhone = typeof profile?.phone === "string" ? profile.phone : "";

    // Primary parent (parent_id) or any guardian whose phone matches, incl. secondary guardians
    const { data: candidates, error: candidatesError } = await db
      .from("students")
      .select("id, parent_id, guardians")
      .eq("tenant_id", parent.tenant_id);

    if (candidatesError) {
      return NextResponse.json({ success: false, error: "Failed to load children" }, { status: 500 });
    }

    const childIds = ((candidates ?? []) as StudentRow[])
      .filter((student) => studentLinkedToParent({ parentId: parent.sub, parentPhone, student }))
      .map((student) => student.id);

    let children: StudentRow[] = [];
    if (childIds.length > 0) {
      const { data: rows, error: rowsError } = await db
        .from("students")
        .select(STUDENT_SELECT)
        .in("id", childIds)
        .eq("tenant_id", parent.tenant_id);

      if (rowsError) {
        return NextResponse.json({ success: false, error: "Failed to load children" }, { status: 500 });
      }
      children = (rows ?? []) as StudentRow[];
    }

    // Only fill an empty parent_id; never replace another guardian as primary
    const toLink = children.filter((row) => !row.parent_id);
    if (toLink.length > 0) {
      await db
        .from("students")
        .update({ parent_id: parent.sub })
        .in("id", toLink.map((row) => row.id))
        .eq("tenant_id", parent.tenant_id)
        .is("parent_id", null);
    }

    let supabaseAuth: Awaited<ReturnType<typeof ensureParentAuthSession>> | null = null;
    if (request.headers.get("x-bootstrap-supabase") === "1") {
      try {
        supabaseAuth = await ensureParentAuthSession(db, {
          profileId: parent.sub,
          tenantId: parent.tenant_id,
          name: typeof profile?.name === "string" ? profile.name : undefined,
          phone: parentPhone || undefined,
          email: typeof profile?.email === "string" ? profile.email : undefined,
        });
      } catch (err) {
        console.error(
          "Parent Supabase Auth bootstrap on /api/parent/children:",
          err instanceof Error ? err.message : err
        );
      }
    }

    return NextResponse.json({
      success: true,
      children,
      ...(supabaseAuth
        ? {
            supabase_refresh_token: supabaseAuth.supabase_refresh_token,
            supabase_access_token: supabaseAuth.supabase_access_token,
          }
        : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

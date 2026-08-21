import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";
import { mergeParentChildRows } from "@/lib/parentChildren";

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
      .select("id, phone")
      .eq("id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();

    const parentPhone = typeof profile?.phone === "string" ? profile.phone : "";

    const { data: linked, error: linkedError } = await db
      .from("students")
      .select(STUDENT_SELECT)
      .eq("parent_id", parent.sub)
      .eq("tenant_id", parent.tenant_id);

    if (linkedError) {
      return NextResponse.json({ success: false, error: "Failed to load children" }, { status: 500 });
    }

    const { data: unlinked, error: unlinkedError } = await db
      .from("students")
      .select(STUDENT_SELECT)
      .is("parent_id", null)
      .eq("tenant_id", parent.tenant_id);

    if (unlinkedError) {
      return NextResponse.json({
        success: true,
        children: linked ?? [],
      });
    }

    const children = mergeParentChildRows(
      (linked ?? []) as StudentRow[],
      (unlinked ?? []) as StudentRow[],
      parent.sub,
      parentPhone
    );

    const toLink = children.filter((row) => !row.parent_id);
    if (toLink.length > 0) {
      await db
        .from("students")
        .update({ parent_id: parent.sub })
        .in("id", toLink.map((row) => row.id))
        .eq("tenant_id", parent.tenant_id)
        .is("parent_id", null);
    }

    return NextResponse.json({ success: true, children });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

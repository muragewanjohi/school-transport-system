import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";

const querySchema = z.object({
  student_id: z.string().uuid("student_id must be a UUID"),
});

type StudentRow = {
  id: string;
  parent_id: string | null;
  tenant_id: string;
  route_id: string | null;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
};

type EtaRow = {
  stop_id: string;
  route_id: string;
  trip_id: string;
  predicted_arrival: string;
  delay_seconds: number;
  updated_at: string;
};

function minutesUntil(iso: string, now = new Date()): number {
  const arrivalMs = new Date(iso).getTime();
  const secs = Math.floor((arrivalMs - now.getTime()) / 1000);
  if (secs <= 0) return 0;
  return Math.ceil(secs / 60);
}

export async function GET(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      student_id: url.searchParams.get("student_id"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { student_id } = parsed.data;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        eta: null,
      });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, parent_id, tenant_id, route_id, pickup_stop_id, dropoff_stop_id")
      .eq("id", student_id)
      .maybeSingle();

    if (studentError) {
      return NextResponse.json({ success: false, error: "Failed to load student" }, { status: 500 });
    }

    const row = student as StudentRow | null;
    if (!row) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    if (row.parent_id !== parent.sub || row.tenant_id !== parent.tenant_id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const stopId = row.pickup_stop_id ?? row.dropoff_stop_id;
    if (!row.route_id || !stopId) {
      return NextResponse.json({
        success: true,
        eta: null,
        reason: "no_route_or_stop",
      });
    }

    const { data: etaRows, error: etaError } = await db
      .from("trip_stop_etas")
      .select("stop_id, route_id, trip_id, predicted_arrival, delay_seconds, updated_at")
      .eq("route_id", row.route_id)
      .eq("stop_id", stopId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (etaError) {
      return NextResponse.json({ success: false, error: "Failed to load ETA" }, { status: 500 });
    }

    const eta = (etaRows?.[0] as EtaRow | undefined) ?? null;
    if (!eta) {
      return NextResponse.json({
        success: true,
        eta: null,
        reason: "no_active_eta",
      });
    }

    return NextResponse.json({
      success: true,
      eta: {
        student_id: row.id,
        stop_id: eta.stop_id,
        route_id: eta.route_id,
        trip_id: eta.trip_id,
        predicted_arrival: eta.predicted_arrival,
        delay_seconds: eta.delay_seconds,
        eta_minutes: minutesUntil(eta.predicted_arrival),
        updated_at: eta.updated_at,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

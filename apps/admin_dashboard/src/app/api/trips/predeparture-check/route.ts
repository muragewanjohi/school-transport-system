import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { getCallerProfile, isPlatformSuperAdmin } from "@/lib/authApi";
import {
  DEFAULT_PREDEPARTURE_GRACE_MINUTES,
  predepartureUpdatePayload,
  shouldMarkPredepartureDelayed,
  type PredepartureTripCandidate,
} from "@/lib/predepartureCheck";

type TripJoinRow = {
  id: string;
  tenant_id: string;
  status: string;
  started_at: string | null;
  status_override: string | null;
  custom_departure_time: string | null;
  trip_date: string;
  schedules:
    | { departure_time: string; name?: string | null }
    | { departure_time: string; name?: string | null }[]
    | null;
};

async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  const caller = await getCallerProfile(request);
  return isPlatformSuperAdmin(caller);
}

function todayInNairobi(now = new Date()): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function scheduleDeparture(schedules: TripJoinRow["schedules"]): string | null {
  if (!schedules) return null;
  if (Array.isArray(schedules)) {
    return schedules[0]?.departure_time ?? null;
  }
  return schedules.departure_time ?? null;
}

function graceMinutes(): number {
  const raw = process.env.PREDEPARTURE_GRACE_MINUTES;
  if (!raw) return DEFAULT_PREDEPARTURE_GRACE_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PREDEPARTURE_GRACE_MINUTES;
}

/**
 * Pre-departure delay check — Vercel Cron every 5 minutes (see vercel.json).
 * Marks still-scheduled trips as Delayed when departure + grace has passed
 * with no started_at. Notifications fire via on_trip_status_update.
 */
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: { examined: 0, marked: 0, skipped: 0 },
      });
    }

    if (!(await isAuthorized(request))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = getServiceSupabaseClient();
    if (!adminClient) {
      return NextResponse.json({ success: false, error: "Service role key missing" }, { status: 500 });
    }

    const now = new Date();
    const today = todayInNairobi(now);
    const grace = graceMinutes();

    const { data, error } = await adminClient
      .from("trips")
      .select(
        "id, tenant_id, status, started_at, status_override, custom_departure_time, trip_date, schedules!inner(departure_time, name)"
      )
      .eq("trip_date", today)
      .eq("status", "scheduled")
      .is("started_at", null);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as TripJoinRow[];
    let marked = 0;
    let skipped = 0;
    const markedIds: string[] = [];
    const notes: string[] = [];

    for (const row of rows) {
      const departure = scheduleDeparture(row.schedules);
      if (!departure) {
        skipped += 1;
        continue;
      }

      const candidate: PredepartureTripCandidate = {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        status_override: row.status_override,
        custom_departure_time: row.custom_departure_time,
        trip_date: row.trip_date,
        departure_time: departure,
      };

      if (!shouldMarkPredepartureDelayed(candidate, now, grace)) {
        skipped += 1;
        continue;
      }

      const payload = predepartureUpdatePayload();
      const { error: updateError } = await adminClient
        .from("trips")
        .update(payload)
        .eq("id", row.id)
        .eq("status", "scheduled")
        .is("started_at", null);

      if (updateError) {
        notes.push(`trip ${row.id}: ${updateError.message}`);
        skipped += 1;
        continue;
      }

      marked += 1;
      markedIds.push(row.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        trip_date: today,
        grace_minutes: grace,
        examined: rows.length,
        marked,
        skipped,
        marked_ids: markedIds,
        notes,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

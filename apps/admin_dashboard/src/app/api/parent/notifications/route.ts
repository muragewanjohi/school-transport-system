import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";

const LIMIT = 50;

export type ParentNotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        notifications: [],
        unread_count: 0,
      });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { data, error } = await db
      .from("notifications")
      .select("id, title, message, notification_type, read, created_at")
      .eq("user_id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to load notifications" }, { status: 500 });
    }

    const notifications = (data ?? []) as ParentNotificationRow[];
    const unread_count = notifications.filter((row) => !row.read).length;

    return NextResponse.json({
      success: true,
      notifications,
      unread_count,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string().uuid()).max(LIMIT).optional(),
});

export async function PATCH(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const markAll = parsed.data.all === true;
    const ids = parsed.data.ids ?? [];
    if (!markAll && ids.length === 0) {
      return NextResponse.json({ success: false, error: "Provide all=true or ids" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", updated: 0 });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    let query = db
      .from("notifications")
      .update({ read: true })
      .eq("user_id", parent.sub)
      .eq("tenant_id", parent.tenant_id);

    if (!markAll) {
      query = query.in("id", ids);
    }

    const { data, error } = await query.select("id");

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to update notifications" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: Array.isArray(data) ? data.length : 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", deleted: 0 });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { data, error } = await db
      .from("notifications")
      .delete()
      .eq("user_id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .select("id");

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to clear notifications" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: Array.isArray(data) ? data.length : 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

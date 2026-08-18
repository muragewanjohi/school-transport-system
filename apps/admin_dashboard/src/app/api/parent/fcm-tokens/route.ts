import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";

const tokenSchema = z.object({
  token: z.string().min(10).max(4096),
  device_type: z.enum(["ios", "android"]).optional(),
});

export async function POST(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
    if (!parent) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = tokenSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock" });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { token, device_type } = parsed.data;
    const { error } = await db.from("user_fcm_tokens").upsert(
      {
        user_id: parent.sub,
        token,
        device_type: device_type ?? "android",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" }
    );

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to save token" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
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

    const parsed = tokenSchema.pick({ token: true }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock" });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { error } = await db
      .from("user_fcm_tokens")
      .delete()
      .eq("user_id", parent.sub)
      .eq("token", parsed.data.token);

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to remove token" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

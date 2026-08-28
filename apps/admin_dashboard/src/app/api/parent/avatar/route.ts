import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { parentSessionFromRequest } from "@/lib/parentSession";
import {
  avatarObjectPath,
  canEditStudentAvatar,
  decodeImageBase64,
  imageContentType,
  withGuardianAvatarUrl,
} from "@/lib/parentAvatar";

const bodySchema = z.object({
  target: z.enum(["profiles", "students", "guardian"]),
  id: z.string().uuid(),
  guardian_phone: z.string().min(5).max(32).optional(),
  image_base64: z.string().min(32).max(5_000_000),
});

export async function POST(request: Request) {
  try {
    const parent = parentSessionFromRequest(request);
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

    const bytes = decodeImageBase64(parsed.data.image_base64);
    if (!bytes) {
      return NextResponse.json({ success: false, error: "Invalid image" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        avatar_url: "https://example.invalid/avatars/mock.jpg",
      });
    }

    const db = getServiceSupabaseClient();
    if (!db) {
      return NextResponse.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }

    const { target, id } = parsed.data;
    const contentType = imageContentType(bytes);
    const storagePath = avatarObjectPath(parent.sub, target, id);

    if (target === "profiles") {
      if (id !== parent.sub) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      const uploaded = await uploadAvatarObject(db, storagePath, bytes, contentType);
      if (!uploaded.ok) {
        return NextResponse.json({ success: false, error: "Upload failed" }, { status: 502 });
      }
      const { error } = await db
        .from("profiles")
        .update({ avatar_url: uploaded.publicUrl })
        .eq("id", parent.sub)
        .eq("tenant_id", parent.tenant_id);
      if (error) {
        return NextResponse.json({ success: false, error: "Could not save photo" }, { status: 500 });
      }
      return NextResponse.json({ success: true, avatar_url: uploaded.publicUrl });
    }

    const { data: profile } = await db
      .from("profiles")
      .select("id, phone")
      .eq("id", parent.sub)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();
    const parentPhone = typeof profile?.phone === "string" ? profile.phone : "";

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, parent_id, guardians, tenant_id")
      .eq("id", id)
      .eq("tenant_id", parent.tenant_id)
      .maybeSingle();

    if (studentError || !student) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    if (
      !canEditStudentAvatar({
        parentId: parent.sub,
        parentPhone,
        student,
      })
    ) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (target === "guardian") {
      const phone = parsed.data.guardian_phone ?? "";
      const updated = withGuardianAvatarUrl({
        guardians: student.guardians,
        guardianPhone: phone,
        avatarUrl: "pending",
      });
      const matched = updated.some((row) => row.avatar_url === "pending");
      if (!phone || !matched) {
        return NextResponse.json({ success: false, error: "Guardian not found" }, { status: 404 });
      }
    }

    const uploaded = await uploadAvatarObject(db, storagePath, bytes, contentType);
    if (!uploaded.ok) {
      return NextResponse.json({ success: false, error: "Upload failed" }, { status: 502 });
    }

    if (target === "guardian") {
      const updated = withGuardianAvatarUrl({
        guardians: student.guardians,
        guardianPhone: parsed.data.guardian_phone ?? "",
        avatarUrl: uploaded.publicUrl,
      });
      const { error } = await db
        .from("students")
        .update({ guardians: updated })
        .eq("id", id)
        .eq("tenant_id", parent.tenant_id);
      if (error) {
        return NextResponse.json({ success: false, error: "Could not save photo" }, { status: 500 });
      }
      return NextResponse.json({ success: true, avatar_url: uploaded.publicUrl });
    }

    const { error } = await db
      .from("students")
      .update({ avatar_url: uploaded.publicUrl })
      .eq("id", id)
      .eq("tenant_id", parent.tenant_id);
    if (error) {
      return NextResponse.json({ success: false, error: "Could not save photo" }, { status: 500 });
    }
    return NextResponse.json({ success: true, avatar_url: uploaded.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

type AdminClient = NonNullable<ReturnType<typeof getServiceSupabaseClient>>;

async function uploadAvatarObject(
  db: AdminClient,
  storagePath: string,
  bytes: Buffer,
  contentType: string
): Promise<{ ok: true; publicUrl: string } | { ok: false }> {
  const { error } = await db.storage.from("avatars").upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) return { ok: false };
  const { data } = db.storage.from("avatars").getPublicUrl(storagePath);
  if (!data.publicUrl) return { ok: false };
  return { ok: true, publicUrl: data.publicUrl };
}

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "avatars";

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!isSupabaseConfigured) {
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type || "image/jpeg"};base64,${base64}`;
      return NextResponse.json({ success: true, url: dataUrl });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const client = getServiceSupabaseClient() ?? scope.client;
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${scope.tenantId}/${folder}/${Date.now()}_${sanitizedName}`;

    const { error } = await client.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.warn("Supabase Storage upload error, falling back to base64 Data URL:", error.message);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type || "image/jpeg"};base64,${base64}`;
      return NextResponse.json({ success: true, url: dataUrl });
    }

    const { data: publicUrlData } = client.storage.from("avatars").getPublicUrl(fileName);
    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

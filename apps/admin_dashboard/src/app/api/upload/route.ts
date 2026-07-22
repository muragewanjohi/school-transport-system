import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

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

    if (isSupabaseConfigured) {
      const client = getSupabaseClient();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const fileName = `${folder}/${Date.now()}_${sanitizedName}`;

      const { data, error } = await client.storage
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
    } else {
      // Mock mode fallback: convert file to base64 Data URL
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type || "image/jpeg"};base64,${base64}`;
      return NextResponse.json({ success: true, url: dataUrl });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

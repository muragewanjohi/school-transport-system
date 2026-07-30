import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";

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
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
      const userClient = getSupabaseClient(token);
      const { data: { user } } = await userClient.auth.getUser();

      // Prefer service role for storage writes; fall back to user-scoped client
      const client = getServiceSupabaseClient() ?? userClient;
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const ownerFolder = user?.id || folder;
      const fileName = `${ownerFolder}/${Date.now()}_${sanitizedName}`;

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

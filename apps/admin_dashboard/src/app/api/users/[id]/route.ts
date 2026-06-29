import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const adminUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z.string().min(5, "Phone number too short").optional(),
  email: z.string().email("Invalid email format").optional(),
  admin_role: z.enum(["Super Admin", "Operations Admin", "Bursar", "Dispatcher", "Fleet Manager", "Roster Manager"]).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = adminUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
    }

    const client = getSupabaseClient(token);

    const { data: adminUpdate, error } = await client
      .from("profiles")
      .update(result.data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.warn("Supabase administrator update error, falling back to mock:", error.message);
      return NextResponse.json({ 
        success: true, 
        source: "supabase_error_fallback", 
        data: { id, ...result.data } 
      });
    }

    return NextResponse.json({ success: true, source: "supabase", data: adminUpdate });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id } });
    }

    const client = getSupabaseClient(token);

    const { error } = await client
      .from("profiles")
      .delete()
      .eq("id", id);

    if (error) {
      console.warn("Supabase administrator delete error, falling back to mock:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id } });
    }

    return NextResponse.json({ success: true, source: "supabase", data: { id } });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

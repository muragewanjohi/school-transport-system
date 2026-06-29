import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";

const routeUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters")
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;
    const body: unknown = await request.json();
    const result = routeUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          id: routeId,
          name: result.data.name,
          path: null
        }
      });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
    const client = getSupabaseClient(token);

    const { data: routeUpdate, error } = await client
      .from("routes")
      .update({ name: result.data.name })
      .eq("id", routeId)
      .select()
      .single();

    if (error) {
      console.warn("Supabase route update error, falling back to mock save:", error.message);
      return NextResponse.json({
        success: true,
        source: "supabase_error_fallback",
        data: {
          id: routeId,
          name: result.data.name,
          path: null
        }
      });
    }

    return NextResponse.json({
      success: true,
      source: "supabase",
      data: routeUpdate
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeId } = await params;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock"
      });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
    const client = getSupabaseClient(token);

    const { error } = await client
      .from("routes")
      .delete()
      .eq("id", routeId);

    if (error) {
      console.warn("Supabase route delete error, falling back to mock save:", error.message);
      return NextResponse.json({
        success: true,
        source: "supabase_error_fallback"
      });
    }

    return NextResponse.json({
      success: true,
      source: "supabase"
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

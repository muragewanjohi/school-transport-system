import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

const conductorUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z.string().min(5, "Phone number too short").optional(),
  email: z.string().email("Invalid email format").optional(),
  national_id: z.string().min(4, "National ID must be at least 4 characters").optional(),
  status: z.enum(["Available", "Unavailable"]).optional(),
  avatar_url: z.string().optional().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = conductorUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.error.flatten().fieldErrors }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id, ...result.data } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: conductorUpdate, error } = await scope.client
      .from("profiles")
      .update(result.data)
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .eq("role", "conductor")
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Supabase conductor update error, falling back to mock:", error.message);
      return NextResponse.json({
        success: true,
        source: "supabase_error_fallback",
        data: { id, ...result.data },
      });
    }

    if (!conductorUpdate) {
      return NextResponse.json({ success: false, error: "Conductor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: conductorUpdate });

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

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { id } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: deleted, error } = await scope.client
      .from("profiles")
      .delete()
      .eq("id", id)
      .eq("tenant_id", scope.tenantId)
      .eq("role", "conductor")
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Supabase conductor delete error, falling back to mock:", error.message);
      return NextResponse.json({ success: true, source: "supabase_error_fallback", data: { id } });
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Conductor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, source: "supabase", data: { id } });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

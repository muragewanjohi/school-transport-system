import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { z } from "zod";
import {
  demoReadonlyForbiddenResponse,
  getCallerProfile,
  isDemoReadonly,
} from "@/lib/authApi";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

const schoolLocationSchema = z.object({
  name: z.string().min(2),
  latitude: z.number(),
  longitude: z.number(),
});

const routeUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  schoolStart: schoolLocationSchema.optional(),
  schoolEnd: schoolLocationSchema.optional(),
});

interface StopRow {
  id: string;
  sequence_no: number;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

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
          path: null,
          schoolStart: result.data.schoolStart ?? null,
          schoolEnd: result.data.schoolEnd ?? null,
        }
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    const { data: routeUpdate, error } = await client
      .from("routes")
      .update({ name: result.data.name })
      .eq("id", routeId)
      .eq("tenant_id", scope.tenantId)
      .select()
      .maybeSingle();

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

    if (!routeUpdate) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
    }

    if (result.data.schoolStart || result.data.schoolEnd) {
      const { data: stops } = await client
        .from("stops")
        .select("id, sequence_no")
        .eq("route_id", routeId)
        .eq("tenant_id", scope.tenantId)
        .order("sequence_no", { ascending: true });

      const ordered = (stops ?? []) as StopRow[];
      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      if (result.data.schoolStart && first) {
        await client
          .from("stops")
          .update({
            name: result.data.schoolStart.name,
            location: `POINT(${result.data.schoolStart.longitude} ${result.data.schoolStart.latitude})`,
          })
          .eq("id", first.id)
          .eq("tenant_id", scope.tenantId)
          .eq("route_id", routeId);
      }
      if (result.data.schoolEnd && last && last.id !== first?.id) {
        await client
          .from("stops")
          .update({
            name: result.data.schoolEnd.name,
            location: `POINT(${result.data.schoolEnd.longitude} ${result.data.schoolEnd.latitude})`,
          })
          .eq("id", last.id)
          .eq("tenant_id", scope.tenantId)
          .eq("route_id", routeId);
      }
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
    const caller = await getCallerProfile(request);
    if (isDemoReadonly(caller)) {
      return demoReadonlyForbiddenResponse();
    }

    const { id: routeId } = await params;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock"
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: deleted, error } = await scope.client
      .from("routes")
      .delete()
      .eq("id", routeId)
      .eq("tenant_id", scope.tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Supabase route delete error, falling back to mock save:", error.message);
      return NextResponse.json({
        success: true,
        source: "supabase_error_fallback"
      });
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
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

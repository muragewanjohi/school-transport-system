import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { stop_ids, route_id } = body;

    if (!Array.isArray(stop_ids) || !route_id) {
      return NextResponse.json({ success: false, error: "Invalid parameters" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock" });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);
    const client = scope.client;

    const { data: ownedRoute } = await client
      .from("routes")
      .select("id")
      .eq("id", route_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (!ownedRoute) {
      return NextResponse.json({ success: false, error: "Route not found" }, { status: 404 });
    }

    const { data: ownedStops } = await client
      .from("stops")
      .select("id, route_id")
      .in("id", stop_ids)
      .eq("tenant_id", scope.tenantId)
      .eq("route_id", route_id);

    if (!ownedStops || ownedStops.length !== stop_ids.length) {
      return NextResponse.json(
        { success: false, error: "One or more stops do not belong to this school's route" },
        { status: 403 }
      );
    }

    const { error: rpcError } = await client.rpc("reorder_stops", {
      stop_ids: stop_ids,
    });

    if (!rpcError) {
      return NextResponse.json({ success: true, source: "supabase_rpc" });
    }

    console.warn("RPC reorder_stops failed, falling back to sequential batch updates:", rpcError.message);

    for (let i = 0; i < stop_ids.length; i++) {
      const { error: negError } = await client
        .from("stops")
        .update({ sequence_no: -(i + 1) })
        .eq("id", stop_ids[i])
        .eq("tenant_id", scope.tenantId)
        .eq("route_id", route_id);
      if (negError) {
        console.error(`Failed to update temporary sequence for stop ${stop_ids[i]}:`, negError.message);
      }
    }

    for (let i = 0; i < stop_ids.length; i++) {
      const { error: posError } = await client
        .from("stops")
        .update({ sequence_no: i + 1 })
        .eq("id", stop_ids[i])
        .eq("tenant_id", scope.tenantId)
        .eq("route_id", route_id);
      if (posError) {
        return NextResponse.json({ success: false, error: posError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, source: "supabase_sequential_fallback" });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

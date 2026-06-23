import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { stop_ids, route_id } = body;

    if (!Array.isArray(stop_ids) || !route_id) {
      return NextResponse.json({ success: false, error: "Invalid parameters" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock" });
    }

    const client = getSupabaseClient(token);

    // Try calling the RPC first (clean & atomic)
    const { error: rpcError } = await client.rpc("reorder_stops", {
      stop_ids: stop_ids,
    });

    if (!rpcError) {
      return NextResponse.json({ success: true, source: "supabase_rpc" });
    }

    console.warn("RPC reorder_stops failed, falling back to sequential batch updates:", rpcError.message);

    // Fallback: Perform sequential updates with temporary sequence numbers to avoid unique constraint checks.
    // 1. Set all sequences to negative values first
    for (let i = 0; i < stop_ids.length; i++) {
      const { error: negError } = await client
        .from("stops")
        .update({ sequence_no: -(i + 1) })
        .eq("id", stop_ids[i]);
      if (negError) {
        console.error(`Failed to update temporary sequence for stop ${stop_ids[i]}:`, negError.message);
      }
    }

    // 2. Set all sequences to final positive values
    for (let i = 0; i < stop_ids.length; i++) {
      const { error: posError } = await client
        .from("stops")
        .update({ sequence_no: i + 1 })
        .eq("id", stop_ids[i]);
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

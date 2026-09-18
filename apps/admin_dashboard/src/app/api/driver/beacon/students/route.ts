import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";

/**
 * GET /api/driver/beacon/students
 * Slim student list for Provision Tag picker (driver/conductor only).
 */
export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const session = verifyDriverSession(token);
    if (!session || (session.role !== "driver" && session.role !== "conductor")) {
      return NextResponse.json(
        { success: false, error: "Driver or conductor session required" },
        { status: 403 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: [
          { id: "00000000-0000-4000-8000-000000000101", name: "Demo Student A", grade: "Grade 4" },
          { id: "00000000-0000-4000-8000-000000000102", name: "Demo Student B", grade: "Grade 5" },
        ],
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data, error } = await scope.client
      .from("students")
      .select("id, name, grade")
      .eq("tenant_id", scope.tenantId)
      .order("name", { ascending: true });

    if (error) {
      console.error("beacon students list", error.message);
      return NextResponse.json({ success: false, error: "Could not load students" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    console.error(
      "GET /api/driver/beacon/students",
      error instanceof Error ? error.message : "error"
    );
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

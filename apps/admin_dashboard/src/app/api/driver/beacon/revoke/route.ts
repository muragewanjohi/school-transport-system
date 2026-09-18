import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";

function requireDriverOrConductor(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  const session = verifyDriverSession(token);
  if (!session || (session.role !== "driver" && session.role !== "conductor")) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Driver or conductor session required" },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}

const revokeSchema = z
  .object({
    tag_id: z.string().uuid().optional(),
    student_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.tag_id || v.student_id), {
    message: "tag_id or student_id required",
  });

/**
 * POST /api/driver/beacon/revoke
 * Soft-revokes an active beacon assignment (lost / replaced tag).
 */
export async function POST(request: Request) {
  try {
    const auth = requireDriverOrConductor(request);
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, source: "mock", data: { revoked: 1 } });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    let query = scope.client
      .from("student_beacon_tags")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active");

    if (parsed.data.tag_id) {
      query = query.eq("id", parsed.data.tag_id);
    } else if (parsed.data.student_id) {
      query = query.eq("student_id", parsed.data.student_id);
    }

    const { data, error } = await query.select("id");
    if (error) {
      console.error("beacon revoke", error.message);
      return NextResponse.json({ success: false, error: "Could not revoke tag" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { revoked: data?.length ?? 0 },
    });
  } catch (error) {
    console.error(
      "POST /api/driver/beacon/revoke",
      error instanceof Error ? error.message : "error"
    );
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

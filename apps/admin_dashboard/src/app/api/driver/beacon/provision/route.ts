import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";
import { normalizeBeaconUuid, provisionPinRejectReason } from "@/lib/beaconProvision";

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

const provisionSchema = z.object({
  student_id: z.string().uuid(),
  uuid: z.string().min(32),
  major: z.number().int().min(0).max(65535),
  minor: z.number().int().min(0).max(65535),
  mac: z.string().min(4).max(64).optional().nullable(),
  device_name: z.string().max(64).optional().nullable(),
  provision_pin: z.string().optional(),
  password_locked: z.boolean().optional().default(true),
});

/**
 * POST /api/driver/beacon/provision
 * Records a successful on-device provision and binds tag → student.
 */
export async function POST(request: Request) {
  try {
    const auth = requireDriverOrConductor(request);
    if (!auth.ok) return auth.response;

    const body: unknown = await request.json();
    const parsed = provisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    let uuid: string;
    try {
      uuid = normalizeBeaconUuid(payload.uuid);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid beacon UUID" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          student_id: payload.student_id,
          uuid,
          major: payload.major,
          minor: payload.minor,
          status: "active",
        },
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const { data: config } = await scope.client
      .from("tenant_configs")
      .select("beacon_provision_pin_hash, beacon_next_minor")
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    const pinError = provisionPinRejectReason(
      payload.provision_pin,
      config?.beacon_provision_pin_hash as string | null | undefined
    );
    if (pinError) {
      return NextResponse.json({ success: false, error: pinError }, { status: 403 });
    }

    const { data: student } = await scope.client
      .from("students")
      .select("id")
      .eq("id", payload.student_id)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (!student) {
      return NextResponse.json({ success: false, error: "Student not found" }, { status: 404 });
    }

    // Revoke any prior active assignment for this student or identity.
    await scope.client
      .from("student_beacon_tags")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .eq("student_id", payload.student_id);

    await scope.client
      .from("student_beacon_tags")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .eq("uuid", uuid)
      .eq("major", payload.major)
      .eq("minor", payload.minor);

    if (payload.mac) {
      await scope.client
        .from("student_beacon_tags")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("tenant_id", scope.tenantId)
        .eq("status", "active")
        .eq("mac", payload.mac);
    }

    const { data: row, error } = await scope.client
      .from("student_beacon_tags")
      .insert({
        tenant_id: scope.tenantId,
        student_id: payload.student_id,
        uuid,
        major: payload.major,
        minor: payload.minor,
        mac: payload.mac ?? null,
        device_name: payload.device_name ?? null,
        status: "active",
      })
      .select("id, student_id, uuid, major, minor, mac, device_name, status, provisioned_at")
      .single();

    if (error || !row) {
      console.error("beacon provision insert", error?.message ?? "missing row");
      return NextResponse.json(
        { success: false, error: "Could not save beacon assignment" },
        { status: 500 }
      );
    }

    const nextMinor = Math.min(65535, Math.max(payload.minor + 1, (config?.beacon_next_minor ?? 1)));
    await scope.client
      .from("tenant_configs")
      .update({ beacon_next_minor: nextMinor })
      .eq("tenant_id", scope.tenantId);

    return NextResponse.json({
      success: true,
      data: { ...row, password_locked: payload.password_locked },
    });
  } catch (error) {
    console.error(
      "POST /api/driver/beacon/provision",
      error instanceof Error ? error.message : "error"
    );
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

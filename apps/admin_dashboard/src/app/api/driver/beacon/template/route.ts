import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { requireOperationalTenant, tenantScopeError } from "@/lib/tenantScope";
import { verifyDriverSession } from "@/lib/driverSession";
import { extractBearerToken } from "@/lib/authApi";
import {
  DEFAULT_BEACON_UUID,
  FACTORY_TAG_PASSWORD,
  buildBeaconTemplate,
  encryptBeaconPassword,
  generateBeaconDevicePassword,
  provisionPinRejectReason,
} from "@/lib/beaconProvision";

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

const templateQuerySchema = z.object({
  provision_pin: z.string().optional(),
});

/**
 * GET /api/driver/beacon/template
 * Returns tenant iBeacon template + passwords for a provision session.
 */
export async function GET(request: Request) {
  try {
    const auth = requireDriverOrConductor(request);
    if (!auth.ok) return auth.response;

    if (!isSupabaseConfigured) {
      const template = buildBeaconTemplate({
        beaconUuid: DEFAULT_BEACON_UUID,
        nextMinor: 1,
        encryptedPassword: null,
        provisionPinHash: null,
      });
      return NextResponse.json({
        success: true,
        source: "mock",
        data: {
          ...template,
          unlock_password: FACTORY_TAG_PASSWORD,
          new_device_password: template.device_password,
          active_tag_count: 0,
        },
      });
    }

    const scope = await requireOperationalTenant(request);
    if (!scope.ok) return tenantScopeError(scope);

    const url = new URL(request.url);
    const parsed = templateQuerySchema.safeParse({
      provision_pin: url.searchParams.get("provision_pin") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: config } = await scope.client
      .from("tenant_configs")
      .select(
        "beacon_uuid, beacon_device_password_enc, beacon_provision_pin_hash, beacon_next_minor"
      )
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (!config) {
      return NextResponse.json(
        { success: false, error: "Tenant config not found" },
        { status: 404 }
      );
    }

    const pinError = provisionPinRejectReason(
      parsed.data.provision_pin,
      config.beacon_provision_pin_hash as string | null
    );
    if (pinError) {
      return NextResponse.json({ success: false, error: pinError }, { status: 403 });
    }

    const updates: Record<string, string | number> = {};
    let beaconUuid = (config.beacon_uuid as string | null) ?? null;
    let passwordEnc = (config.beacon_device_password_enc as string | null) ?? null;

    if (!beaconUuid) {
      beaconUuid = DEFAULT_BEACON_UUID;
      updates.beacon_uuid = beaconUuid;
    }
    if (!passwordEnc) {
      passwordEnc = encryptBeaconPassword(generateBeaconDevicePassword());
      updates.beacon_device_password_enc = passwordEnc;
    }

    if (Object.keys(updates).length > 0) {
      await scope.client.from("tenant_configs").update(updates).eq("tenant_id", scope.tenantId);
    }

    const { count } = await scope.client
      .from("student_beacon_tags")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active");

    const activeTagCount = count ?? 0;

    const template = buildBeaconTemplate({
      beaconUuid,
      nextMinor: config.beacon_next_minor,
      encryptedPassword: passwordEnc,
      provisionPinHash: config.beacon_provision_pin_hash,
    });

    // Physical tags still use factory password until at least one OnTheBus provision.
    const unlockPassword =
      activeTagCount === 0 ? FACTORY_TAG_PASSWORD : template.device_password;

    return NextResponse.json({
      success: true,
      data: {
        ...template,
        unlock_password: unlockPassword,
        new_device_password: template.device_password,
        active_tag_count: activeTagCount,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/driver/beacon/template",
      error instanceof Error ? error.message : "error"
    );
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

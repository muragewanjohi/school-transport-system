import crypto from "crypto";

const FACTORY_TAG_PASSWORD = "DX1234";
const DEFAULT_BEACON_UUID = "A1B2C3D4-E5F6-4789-A012-3456789ABCDE";

export { FACTORY_TAG_PASSWORD, DEFAULT_BEACON_UUID };

function passwordSecret(): string {
  return (
    process.env.BEACON_PASSWORD_SECRET ||
    process.env.DRIVER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-beacon-password-secret"
  );
}

/** 6-character alphanumeric password for CP35 device lock. */
export function generateBeaconDevicePassword(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function encryptBeaconPassword(plain: string): string {
  const key = crypto.createHash("sha256").update(passwordSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptBeaconPassword(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");
    if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const key = crypto.createHash("sha256").update(passwordSecret()).digest();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function hashProvisionPin(pin: string): string {
  return crypto.createHash("sha256").update(`${passwordSecret()}:${pin}`).digest("hex");
}

/** Fixed Provision PIN for the permanent Play Store review tenant. */
export const PLAY_REVIEW_PROVISION_PIN = "654321";

/** 6-digit numeric PIN for Driver App Provision Tag (admins set; drivers enter). */
export function generateProvisionPin(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

/**
 * Verify driver-entered Provision PIN against stored hash.
 * Missing hash (legacy / not configured) → false (no open gate).
 */
export function verifyProvisionPin(pin: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  if (!pin || pin.trim().length === 0) return false;
  const candidate = hashProvisionPin(pin.trim());
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function provisionPinConfigured(hash: string | null | undefined): boolean {
  return Boolean(hash && hash.length > 0);
}

/** Null when PIN is valid; otherwise human-readable 403 message. */
export function provisionPinRejectReason(
  pin: string | undefined,
  hash: string | null | undefined
): string | null {
  if (!provisionPinConfigured(hash)) {
    return "Provision PIN not configured — ask school admin";
  }
  if (!verifyProvisionPin(pin ?? "", hash)) {
    return "Invalid provision PIN";
  }
  return null;
}

/** Strip secrets before sending tenant_configs to the browser. */
export function sanitizeTenantConfigForClient(
  config: Record<string, unknown>
): Record<string, unknown> {
  const {
    beacon_device_password_enc: _enc,
    beacon_provision_pin_hash: hash,
    mapbox_access_token: _mapbox,
    ...rest
  } = config;
  return {
    ...rest,
    beacon_provision_pin_configured: provisionPinConfigured(
      typeof hash === "string" ? hash : null
    ),
  };
}

export function normalizeBeaconUuid(uuid: string): string {
  const hex = uuid.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (hex.length !== 32) {
    throw new Error("Beacon UUID must be 32 hex characters");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nextMinorValue(current: number | null | undefined): number {
  const n = typeof current === "number" && Number.isFinite(current) ? current : 1;
  if (n < 1) return 1;
  if (n > 65535) return 65535;
  return n;
}

export type BeaconTemplate = {
  uuid: string;
  major: number;
  minor: number;
  tx_dbm: number;
  ibeacon_interval_ms: number;
  tlm_interval_ms: number;
  device_password: string;
  is_factory_password: boolean;
  provision_pin_required: boolean;
};

export function buildBeaconTemplate(input: {
  beaconUuid: string | null | undefined;
  nextMinor: number | null | undefined;
  encryptedPassword: string | null | undefined;
  provisionPinHash: string | null | undefined;
}): BeaconTemplate {
  const uuid = input.beaconUuid
    ? normalizeBeaconUuid(input.beaconUuid)
    : DEFAULT_BEACON_UUID;
  const decrypted = input.encryptedPassword
    ? decryptBeaconPassword(input.encryptedPassword)
    : null;
  const devicePassword = decrypted ?? FACTORY_TAG_PASSWORD;
  return {
    uuid,
    major: 1,
    minor: nextMinorValue(input.nextMinor),
    tx_dbm: -19.5,
    ibeacon_interval_ms: 400,
    tlm_interval_ms: 800,
    device_password: devicePassword,
    is_factory_password: devicePassword === FACTORY_TAG_PASSWORD,
    provision_pin_required: Boolean(input.provisionPinHash),
  };
}

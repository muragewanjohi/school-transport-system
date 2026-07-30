import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getServiceSupabaseClient } from "@/lib/supabaseAdmin";
import { extractBearerToken } from "@/lib/authApi";

export type DriverSessionPayload = {
  sub: string;
  tenant_id: string;
  role: string;
  vehicle_id: string | null;
  exp: number;
};

function sessionSecret(): string {
  return (
    process.env.DRIVER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-driver-session-secret"
  );
}

export function signDriverSession(
  payload: Omit<DriverSessionPayload, "exp">,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const body: DriverSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");
  return `drv.${data}.${sig}`;
}

export function verifyDriverSession(token: string): DriverSessionPayload | null {
  if (!token.startsWith("drv.")) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [, data, sig] = parts;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as DriverSessionPayload;
    if (!payload.sub || !payload.tenant_id || !payload.exp) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export type RequestDbContext = {
  client: SupabaseClient;
  driver: DriverSessionPayload | null;
  mode: "driver" | "admin";
};

/**
 * Driver signed session → service role.
 * Valid Supabase admin JWT → service role (API still requires a real logged-in user).
 */
export async function resolveRequestDb(request: Request): Promise<RequestDbContext | null> {
  const token = extractBearerToken(request);
  if (!token || !isSupabaseConfigured) {
    return null;
  }

  const driver = verifyDriverSession(token);
  if (driver) {
    const service = getServiceSupabaseClient();
    if (!service) {
      return null;
    }
    return { client: service, driver, mode: "driver" };
  }

  const userClient = getSupabaseClient(token);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return null;
  }

  const service = getServiceSupabaseClient();
  return {
    client: service ?? userClient,
    driver: null,
    mode: "admin",
  };
}

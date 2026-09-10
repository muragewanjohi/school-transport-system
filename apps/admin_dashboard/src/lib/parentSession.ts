import crypto from "crypto";
import { extractBearerToken } from "@/lib/authApi";

export type ParentSessionPayload = {
  sub: string;
  tenant_id: string;
  role: "parent";
  exp: number;
};

function sessionSecret(): string {
  return (
    process.env.PARENT_SESSION_SECRET ||
    process.env.DRIVER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-parent-session-secret"
  );
}

/** Sliding HMAC lifetime issued at login and on `/api/auth/parent-refresh`. */
export const PARENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Signed but expired `par.*` tokens may be refreshed within this window. */
export const PARENT_SESSION_REFRESH_GRACE_SECONDS = 60 * 60 * 24 * 30;

export type ParentSessionVerifyOptions = {
  expiredGraceSeconds?: number;
};

export function signParentSession(
  payload: Omit<ParentSessionPayload, "exp" | "role"> & { role?: "parent" },
  ttlSeconds = PARENT_SESSION_TTL_SECONDS
): string {
  const body: ParentSessionPayload = {
    sub: payload.sub,
    tenant_id: payload.tenant_id,
    role: "parent",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");
  return `par.${data}.${sig}`;
}

export function verifyParentSession(
  token: string,
  options?: ParentSessionVerifyOptions
): ParentSessionPayload | null {
  if (!token.startsWith("par.")) {
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
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as ParentSessionPayload;
    if (!payload.sub || !payload.tenant_id || !payload.exp || payload.role !== "parent") {
      return null;
    }
    const grace = options?.expiredGraceSeconds ?? 0;
    if (payload.exp + grace < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Returns verified parent session from Authorization: Bearer par.* or null. */
export function parentSessionFromRequest(
  request: Request,
  options?: ParentSessionVerifyOptions
): ParentSessionPayload | null {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }
  return verifyParentSession(token, options);
}

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

export function signParentSession(
  payload: Omit<ParentSessionPayload, "exp" | "role"> & { role?: "parent" },
  ttlSeconds = 60 * 60 * 24 * 7
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

export function verifyParentSession(token: string): ParentSessionPayload | null {
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
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Returns verified parent session from Authorization: Bearer par.* or null. */
export function parentSessionFromRequest(request: Request): ParentSessionPayload | null {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }
  return verifyParentSession(token);
}

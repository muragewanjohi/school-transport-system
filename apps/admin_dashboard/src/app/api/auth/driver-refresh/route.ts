import { NextResponse } from "next/server";
import { extractBearerToken } from "@/lib/authApi";
import {
  DRIVER_SESSION_REFRESH_GRACE_SECONDS,
  signDriverSession,
  verifyDriverSession,
} from "@/lib/driverSession";

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const driver = verifyDriverSession(token, {
      expiredGraceSeconds: DRIVER_SESSION_REFRESH_GRACE_SECONDS,
    });
    if (!driver) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const access_token = signDriverSession({
      sub: driver.sub,
      tenant_id: driver.tenant_id,
      role: driver.role,
      vehicle_id: driver.vehicle_id,
    });

    return NextResponse.json({ success: true, access_token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

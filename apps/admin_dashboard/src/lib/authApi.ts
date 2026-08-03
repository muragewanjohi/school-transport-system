import { NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";

export interface ApiCallerProfile {
  id: string;
  role: string;
  admin_role: string | null;
  tenant_id: string | null;
  name: string;
  email: string;
}

export function extractBearerToken(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
}

/**
 * Loads the caller's profile via their JWT. Returns null if unauthenticated.
 */
export async function getCallerProfile(request: Request): Promise<ApiCallerProfile | null> {
  const token = extractBearerToken(request);
  if (!token || !isSupabaseConfigured) {
    return null;
  }

  const client = getSupabaseClient(token);
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("id, role, admin_role, tenant_id, name, email")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  return profile as ApiCallerProfile;
}

export function isPlatformSuperAdmin(profile: ApiCallerProfile | null): boolean {
  return profile?.role === "super_admin";
}

/** Read-only Demo Viewer sessions must not mutate school data */
export function isDemoReadonly(profile: ApiCallerProfile | null): boolean {
  return profile?.admin_role === "Demo Viewer";
}

export function demoReadonlyForbiddenResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Demo Viewer access is read-only. Request a full demo to make changes.",
    },
    { status: 403 }
  );
}

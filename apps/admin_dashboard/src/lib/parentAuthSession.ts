import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

export type ParentAuthSessionTokens = {
  supabase_access_token: string;
  supabase_refresh_token: string;
  supabase_expires_in: number | null;
  supabase_user_id: string;
};

function parentSyntheticEmail(profileId: string): string {
  return `parent+${profileId}@users.onthebusapp.internal`;
}

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Ensures an auth.users row with id = parent profile id, then returns a
 * short-lived Supabase session (access + refresh) for the Flutter client.
 */
export async function ensureParentAuthSession(
  adminClient: SupabaseClient,
  params: {
    profileId: string;
    tenantId: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  }
): Promise<ParentAuthSessionTokens> {
  const { profileId, tenantId } = params;
  if (!profileId || !tenantId) {
    throw new Error("profileId and tenantId are required");
  }

  const email =
    params.email && params.email.includes("@") && !params.email.includes("example.com")
      ? params.email
      : parentSyntheticEmail(profileId);
  const password = randomBytes(24).toString("base64url");
  const metadata = {
    role: "parent",
    tenant_id: tenantId,
    name: params.name ?? "Parent",
    phone: params.phone ?? "",
  };

  const { data: existing, error: getError } = await adminClient.auth.admin.getUserById(profileId);

  if (getError && !/not.*found|User not found/i.test(getError.message)) {
    // Continue to create — some projects return 404-style errors for missing users
  }

  if (existing?.user) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(profileId, {
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    });
    if (updateError) {
      throw new Error(`Failed to refresh parent auth user: ${updateError.message}`);
    }
  } else {
    const { error: createError } = await adminClient.auth.admin.createUser({
      id: profileId,
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    });

    if (createError) {
      // Race / already exists — try update path
      const { error: updateError } = await adminClient.auth.admin.updateUserById(profileId, {
        email,
        password,
        email_confirm: true,
        app_metadata: metadata,
        user_metadata: metadata,
      });
      if (updateError) {
        throw new Error(
          `Failed to create parent auth user: ${createError.message}; update: ${updateError.message}`
        );
      }
    }
  }

  const client = anonClient();
  if (!client) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / anon key for session exchange");
  }

  const { data, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !data.session) {
    throw new Error(signInError?.message || "Failed to issue parent Supabase session");
  }

  return {
    supabase_access_token: data.session.access_token,
    supabase_refresh_token: data.session.refresh_token,
    supabase_expires_in: data.session.expires_in ?? null,
    supabase_user_id: data.session.user.id,
  };
}

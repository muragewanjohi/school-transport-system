import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey: string = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  "placeholder-anon-key";

export const isSupabaseConfigured = 
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
  (!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

// Standard client for public or anonymous client-side access
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates or retrieves a Supabase client scoped with a specific JWT access token.
 * This is crucial for Next.js Route Handlers to perform operations on behalf
 * of an authenticated user, enforcing PostgreSQL Row Level Security (RLS).
 *
 * @param jwtToken - The authenticated user's JWT token
 * @returns A configured SupabaseClient instance
 */
export function getSupabaseClient(jwtToken?: string): SupabaseClient {
  if (!jwtToken) {
    return supabase;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    },
  });
}

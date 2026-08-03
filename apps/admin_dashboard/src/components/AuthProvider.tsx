"use client";

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { parseHost, getApexPublicUrl, getTenantPublicUrl, isSchoolConsolePath, isPlatformConsolePath } from "@/lib/tenantHost";

interface AuthProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  admin_role: string | null;
  tenant_id: string | null;
}

interface AuthContextType {
  user: any | null;
  profile: AuthProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isSandbox: boolean;
  isDemoReadonly: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  isSandbox: false,
  isDemoReadonly: false,
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const demoReadonlyRef = useRef(false);

  const isDemoReadonly = profile?.admin_role === "Demo Viewer";
  demoReadonlyRef.current = isDemoReadonly;

  // Patch window.fetch to automatically append JWT access tokens
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        
        // Only intercept local API route handler calls
        if (url.startsWith("/api/") && isSupabaseConfigured) {
          try {
            const method = (init?.method || "GET").toUpperCase();
            const pathOnly = url.split("?")[0];
            // Public lead capture must work even if a Demo Viewer session is still active
            const isPublicDemoLeadPost =
              method === "POST" && pathOnly === "/api/demo-requests";

            if (
              demoReadonlyRef.current &&
              method !== "GET" &&
              method !== "HEAD" &&
              method !== "OPTIONS" &&
              !isPublicDemoLeadPost
            ) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "Demo Viewer access is read-only. Request a full demo to make changes.",
                }),
                { status: 403, headers: { "Content-Type": "application/json" } }
              );
            }

            const token = tokenRef.current;
            
            // Do not attach Demo Viewer JWT to the public request-demo form POST
            if (token && !isPublicDemoLeadPost) {
              init = init || {};
              const headers = new Headers(init.headers);
              if (!headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${token}`);
                init.headers = headers;
              }
            }
          } catch (e) {
            console.error("Failed to intercept fetch auth details:", e);
          }
        }
        return originalFetch(input, init);
      };

      return () => {
        window.fetch = originalFetch;
      };
    }
  }, []);

  // Sync token and check initial session on mount
  useEffect(() => {
    let authSubscription: any = null;

    const checkSession = async () => {
      setLoading(true);
      setErrorMsg(null);

      if (!isSupabaseConfigured) {
        // --- Sandbox Bypass Mode ---
        const savedSession = localStorage.getItem("safaricom_admin_mock_session");
        if (savedSession) {
          const mockProfile = JSON.parse(savedSession);
          setUser({ id: mockProfile.id, email: mockProfile.email });
          setProfile(mockProfile);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
        return;
      }

      // --- Real Supabase Auth Mode ---
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          tokenRef.current = session.access_token;
          setUser(session.user);
        } else {
          tokenRef.current = null;
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error checking auth session:", err);
        setErrorMsg("An unexpected authentication error occurred.");
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes if Supabase is active
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (session) {
            tokenRef.current = session.access_token;
            setUser(session.user);
          }
        } else if (event === "SIGNED_OUT") {
          tokenRef.current = null;
          setUser(null);
          setProfile(null);
          setErrorMsg(null);
          setLoading(false);
        }
      });
      authSubscription = subscription;
    }

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Separate effect to handle async database query for loading user profile.
  // This prevents deadlocks inside Supabase auth listener / getSession.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!user) {
      setProfile(null);
      return;
    }

    // If profile is already loaded for this user, don't refetch it
    if (profile && profile.id === user.id) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const { data: userProfile, error: profileErr } = await supabase
          .from("profiles")
          .select("id, name, email, phone, role, admin_role, tenant_id")
          .eq("id", user.id)
          .single();

        if (profileErr || !userProfile) {
          console.error("Failed to load authenticated user profile:", profileErr?.message);
          setErrorMsg("Your administrator profile could not be loaded from the database.");
          setProfile(null);
        } else {
          // Verify roles: Only school_admin or super_admin are allowed
          if (userProfile.role !== "school_admin" && userProfile.role !== "super_admin") {
            setErrorMsg("Access Denied: You do not have permission to access the Admin Console.");
            setProfile(null);
          } else {
            // Subdomain tenancy: school admins must match host tenant; platform stays on apex
            const host = typeof window !== "undefined" ? window.location.host : "";
            const parsed = parseHost(host);

            if (parsed.kind === "tenant" && userProfile.role === "super_admin") {
              window.location.href = getApexPublicUrl("/schools");
              return;
            }

            if (parsed.kind === "tenant" && userProfile.role === "school_admin") {
              try {
                const res = await fetch(`/api/tenants/resolve?slug=${encodeURIComponent(parsed.slug || "")}`);
                const json = await res.json();
                if (!json.success || json.data?.id !== userProfile.tenant_id) {
                  setErrorMsg("This account does not belong to this school subdomain. Use your school URL to sign in.");
                  setProfile(null);
                  await supabase.auth.signOut();
                  setLoading(false);
                  return;
                }
              } catch {
                setErrorMsg("Could not verify school subdomain.");
                setProfile(null);
                setLoading(false);
                return;
              }
            }

            // Apex / www is platform-only for console routes: send school admins to their subdomain.
            // Allow marketing pages (/ , /request-demo, /demo/*) without redirect or error.
            const onMarketingPublic =
              typeof window !== "undefined" &&
              (window.location.pathname === "/" ||
                window.location.pathname.startsWith("/request-demo") ||
                window.location.pathname.startsWith("/demo/"));

            if (
              (parsed.kind === "apex" || parsed.kind === "local") &&
              userProfile.role === "school_admin" &&
              userProfile.tenant_id &&
              parsed.kind === "apex" &&
              !onMarketingPublic
            ) {
              try {
                const res = await fetch(
                  `/api/tenants/resolve?tenant_id=${encodeURIComponent(userProfile.tenant_id)}`
                );
                const json = await res.json();
                const slug = json.data?.domain as string | undefined;
                if (json.success && slug) {
                  window.location.href = getTenantPublicUrl(slug, "/dashboard");
                  return;
                }
                setErrorMsg(
                  "School accounts must sign in on their subdomain (e.g. yourschool.onthebusapp.com), not www.onthebusapp.com."
                );
                setProfile(null);
                await supabase.auth.signOut();
                setLoading(false);
                return;
              } catch {
                setErrorMsg("Could not resolve your school subdomain. Contact support.");
                setProfile(null);
                setLoading(false);
                return;
              }
            }

            setProfile(userProfile as AuthProfile);
            setErrorMsg(null);
          }
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        setErrorMsg("An unexpected profile loading error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, profile]);

  // Handle page redirects based on authentication state
  useEffect(() => {
    if (loading) return;

    const publicRoutes = ["/", "/login", "/reset-password", "/request-demo", "/demo/explore"];
    const isPublicPage =
      publicRoutes.includes(pathname) ||
      pathname.startsWith("/request-demo") ||
      pathname.startsWith("/demo/");
    const isLoginPage = pathname === "/login";
    const host = typeof window !== "undefined" ? window.location.host : "";
    const parsed = parseHost(host);

    if (!user || (isSupabaseConfigured && !profile && errorMsg)) {
      if (!isPublicPage) {
        router.push("/login");
      }
      return;
    }

    if (!profile) return;

    // Platform operators: never land on school ops pages (even on apex before middleware)
    if (profile.role === "super_admin") {
      if (isLoginPage || isSchoolConsolePath(pathname) || pathname === "/") {
        if (isLoginPage || isSchoolConsolePath(pathname)) {
          router.replace("/schools");
          return;
        }
      }
      if (parsed.kind === "tenant") {
        window.location.href = getApexPublicUrl("/schools");
        return;
      }
      return;
    }

    // School admins: apex is not their console
    if (profile.role === "school_admin") {
      if (parsed.kind === "apex") {
        // Profile fetch effect redirects to subdomain; keep login from bouncing to /dashboard
        if (isLoginPage || isPlatformConsolePath(pathname) || isSchoolConsolePath(pathname)) {
          return;
        }
      }
      if (isLoginPage) {
        router.replace("/dashboard");
      }
    }
  }, [user, profile, loading, pathname, errorMsg, router]);

  const handleSignOut = async () => {
    setLoading(true);
    if (!isSupabaseConfigured) {
      localStorage.removeItem("safaricom_admin_mock_session");
      setUser(null);
      setProfile(null);
    } else {
      await supabase.auth.signOut();
    }
    setLoading(false);
    router.push("/login");
  };

  // Render a full-screen glassmorphic loading spinner while verifying session
  const marketingPublic =
    pathname === "/" ||
    pathname.startsWith("/request-demo") ||
    pathname.startsWith("/demo/");

  // Marketing pages must SSR and hydrate identically — never swap in the auth shell.
  if (loading && !marketingPublic) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: "var(--bg-base, #060913)",
        color: "var(--text-primary, #f1f5f9)",
        fontFamily: "var(--font-sans), sans-serif",
      }}>
        <div style={{
          padding: "32px",
          borderRadius: "16px",
          background: "var(--glass-bg, rgba(12, 17, 34, 0.7))",
          border: "1px solid var(--glass-border, rgba(30, 41, 59, 0.6))",
          backdropFilter: "var(--glass-blur, blur(12px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          boxShadow: "var(--shadow-xl)",
        }}>
          <div className="auth-spinner" style={{
            width: "40px",
            height: "40px",
            border: "3px solid rgba(16, 185, 129, 0.1)",
            borderTop: "3px solid var(--accent-primary, #10b981)",
            borderRadius: "50%",
          }} />
          <p style={{ fontSize: "0.95rem", color: "var(--text-muted, #64748b)" }}>Securing Connection...</p>
        </div>
        <style>{`
          .auth-spinner {
            animation: auth-spin 1s linear infinite;
          }
          @keyframes auth-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // If there's a critical access-denied error, render a clean error page (unless public/marketing)
  if (errorMsg && pathname !== "/login" && !marketingPublic) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: "var(--bg-base, #060913)",
        color: "var(--text-primary, #f1f5f9)",
        fontFamily: "var(--font-sans), sans-serif",
        padding: "20px",
      }}>
        <div style={{
          maxWidth: "400px",
          width: "100%",
          padding: "32px",
          borderRadius: "16px",
          background: "var(--glass-bg, rgba(12, 17, 34, 0.7))",
          border: "1px solid var(--glass-border, rgba(30, 41, 59, 0.6))",
          backdropFilter: "var(--glass-blur, blur(12px))",
          textAlign: "center",
          boxShadow: "var(--shadow-xl)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}>
          <div style={{
            fontSize: "2.5rem",
            color: "var(--state-error, #f43f5e)",
          }}>⚠️</div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Security Intercepted</h2>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted, #64748b)", lineHeight: 1.5 }}>
            {errorMsg}
          </p>
          <button 
            onClick={handleSignOut}
            style={{
              padding: "10px 16px",
              backgroundColor: "var(--bg-surface-hover, #151c36)",
              border: "1px solid var(--border-default, #1e293b)",
              borderRadius: "8px",
              color: "var(--text-primary, #f1f5f9)",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 500,
              transition: "all 0.2s ease",
            }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signOut: handleSignOut,
        isSandbox: !isSupabaseConfigured,
        isDemoReadonly,
      }}
    >
      {isDemoReadonly && isSchoolConsolePath(pathname) ? (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2000,
            background: "#0b3d24",
            color: "#e8fff1",
            textAlign: "center",
            padding: "10px 16px",
            fontSize: "0.9rem",
            fontFamily: "var(--font-sans), sans-serif",
            borderBottom: "1px solid rgba(90, 223, 130, 0.35)",
          }}
        >
          Demo School — read-only explore mode. Changes are disabled.{" "}
          <a href="/request-demo" style={{ color: "#5adf82", fontWeight: 600 }}>
            Book a full walkthrough
          </a>
        </div>
      ) : null}
      {children}
    </AuthContext.Provider>
  );
}

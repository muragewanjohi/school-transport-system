"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  isSandbox: false,
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Patch window.fetch to automatically append JWT access tokens
  useEffect(() => {
    if (typeof window !== "undefined") {
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        
        // Only intercept local API route handler calls
        if (url.startsWith("/api/") && isSupabaseConfigured) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            
            if (token) {
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

  // Main auth listener / session checker
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
          setUser(session.user);
          // Fetch profile details from public.profiles
          const { data: userProfile, error: profileErr } = await supabase
            .from("profiles")
            .select("id, name, email, phone, role, admin_role, tenant_id")
            .eq("id", session.user.id)
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
              setProfile(userProfile as AuthProfile);
            }
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error("Error checking auth session:", err);
        setErrorMsg("An unexpected authentication error occurred.");
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes if Supabase is active
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (session) {
            setUser(session.user);
            const { data: userProfile } = await supabase
              .from("profiles")
              .select("id, name, email, phone, role, admin_role, tenant_id")
              .eq("id", session.user.id)
              .maybeSingle();

            if (userProfile && (userProfile.role === "school_admin" || userProfile.role === "super_admin")) {
              setProfile(userProfile as AuthProfile);
              setErrorMsg(null);
            } else if (userProfile) {
              setErrorMsg("Access Denied: You do not have permission to access the Admin Console.");
              setProfile(null);
            }
          }
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
          setErrorMsg(null);
        }
        setLoading(false);
      });
      authSubscription = subscription;
    }

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Handle page redirects based on authentication state
  useEffect(() => {
    if (loading) return;

    const isLoginPage = pathname === "/login";

    if (!user || (isSupabaseConfigured && !profile && errorMsg)) {
      // If unauthenticated or role-blocked, redirect to /login
      if (!isLoginPage) {
        router.push("/login");
      }
    } else {
      // If authenticated, prevent loading /login again
      if (isLoginPage) {
        router.push("/");
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
  if (loading) {
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

  // If there's a critical access-denied error, render a clean error page (unless they're on /login)
  if (errorMsg && pathname !== "/login") {
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
    <AuthContext.Provider value={{ user, profile, loading, signOut: handleSignOut, isSandbox: !isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

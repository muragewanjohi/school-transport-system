"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

function ExploreInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"working" | "error" | "done">("working");
  const [message, setMessage] = useState("Opening the Demo School…");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("error");
        setMessage("Missing explore token. Use the demo link from your approval email.");
        return;
      }

      try {
        const res = await fetch("/api/demo/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json()) as {
          success: boolean;
          error?: string;
          data?: { email: string; password: string; redirect_url: string };
        };

        if (!res.ok || !json.success || !json.data) {
          if (!cancelled) {
            setStatus("error");
            setMessage(json.error || "Could not open the demo school.");
          }
          return;
        }

        if (isSupabaseConfigured) {
          const { error } = await supabase.auth.signInWithPassword({
            email: json.data.email,
            password: json.data.password,
          });
          if (error) {
            if (!cancelled) {
              setStatus("error");
              setMessage(error.message || "Sign-in failed.");
            }
            return;
          }
        } else {
          localStorage.setItem(
            "safaricom_admin_mock_session",
            JSON.stringify({
              id: "demo-viewer",
              name: "Demo Viewer",
              email: json.data.email,
              phone: null,
              role: "school_admin",
              admin_role: "Demo Viewer",
              tenant_id: "a0000000-0000-4000-8000-000000000001",
            })
          );
        }

        if (!cancelled) {
          setStatus("done");
          setMessage("Signed in. Redirecting to the demo dashboard…");
          window.location.href = json.data.redirect_url;
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong opening the demo.");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="landing-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "var(--lp-surface)",
          border: "1px solid var(--lp-outline)",
          borderRadius: 16,
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <Link href="/" className="landing-brand" style={{ justifyContent: "center", marginBottom: 20 }}>
          <img
            src="/logo.png"
            alt="OnTheBus — Safe Journeys. Brighter Futures."
            className="landing-brand-logo"
            width={360}
            height={130}
          />
        </Link>
        <h1 style={{ fontSize: 22, margin: "0 0 12px", color: "var(--lp-ink)" }}>Explore Demo School</h1>
        <p style={{ color: "var(--lp-muted)", margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        {status === "error" && (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/request-demo" className="lp-btn lp-btn-primary">
              Request Demo
            </Link>
            <Link href="/" className="lp-btn lp-btn-outline-green">
              Back home
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DemoExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="landing-page" style={{ display: "grid", placeItems: "center" }}>
          <p style={{ color: "var(--lp-muted)" }}>Loading…</p>
        </div>
      }
    >
      <ExploreInner />
    </Suspense>
  );
}

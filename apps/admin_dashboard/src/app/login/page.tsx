"use client";

import React, { useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { Mail, Lock, ShieldAlert, Sparkles, Navigation } from "lucide-react";

export default function LoginPage() {
  const [view, setView] = useState<"login" | "forgot">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Sign In form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Forgot Password form state
  const [resetEmail, setResetEmail] = useState("");

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter your email and password.");
      setIsLoading(false);
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        // --- Sandbox Bypass Mode ---
        const mockProfile = {
          id: `adm-mock-${Date.now()}`,
          name: email.split("@")[0].split(".").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "Sarah Jenkins",
          email: email,
          phone: "+254 712 345 678",
          role: "school_admin",
          admin_role: "Super Admin",
          tenant_id: "8c9ad841-f762-4217-a021-9876251b5bcf",
        };
        localStorage.setItem("safaricom_admin_mock_session", JSON.stringify(mockProfile));
        
        // Force page reload to trigger AuthProvider session update
        window.location.href = "/";
        return;
      }

      // --- Real Supabase Login ---
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        setError(signInErr.message);
      } else {
        setSuccess("Login successful! Entering command center...");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "An unexpected error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    if (!resetEmail) {
      setError("Please enter your email address.");
      setIsLoading(false);
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        setSuccess("Sandbox Mode: Password reset link sent successfully to " + resetEmail);
        setIsLoading(false);
        return;
      }

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + "/reset-password",
      });

      if (resetErr) {
        setError(resetErr.message);
      } else {
        setSuccess("Password reset link has been sent to your email address!");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="background-stars" />
      <div className="glass-login-card">
        {/* Header / Logo */}
        <div className="login-header">
          <div className="logo-badge">
            <div className="logo-icon">S</div>
            <span className="logo-text">Safaricom Track</span>
          </div>
          <h1>Admin Command Center</h1>
          <p className="subtitle">Real-time School Fleet & Route Operations</p>
        </div>

        {/* Sandbox Mode Alert Indicator */}
        {!isSupabaseConfigured && (
          <div className="sandbox-indicator">
            <Sparkles size={14} style={{ color: "var(--state-warning)" }} />
            <span>Sandbox Mode Active (Mock Auth Bypass enabled)</span>
          </div>
        )}

        {/* View Titles */}
        <div className="view-title-container">
          <h2 className="view-title">
            {view === "login" ? "Sign In to Console" : "Recover Admin Password"}
          </h2>
          <p className="view-subtitle">
            {view === "login" 
              ? "Access your dashboard metrics & rosters" 
              : "Enter your registered email to request a reset link"
            }
          </p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="status-banner error-banner">
            <ShieldAlert size={16} />
            <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
          </div>
        )}
        {success && (
          <div className="status-banner success-banner">
            <Sparkles size={16} />
            <span>{success}</span>
          </div>
        )}

        {/* Sign In Form */}
        {view === "login" && (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="login-email">Email Address</label>
              <div className="input-with-icon">
                <Mail size={16} className="field-icon" />
                <input 
                  id="login-email"
                  type="email" 
                  placeholder="admin@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="login-password">Password</label>
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); setView("forgot"); setError(null); setSuccess(null); }}
                  className="text-link"
                >
                  Forgot password?
                </a>
              </div>
              <div className="input-with-icon">
                <Lock size={16} className="field-icon" />
                <input 
                  id="login-password"
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Enter Command Center"}
            </button>
          </form>
        )}

        {/* Forgot Password Form */}
        {view === "forgot" && (
          <form onSubmit={handleForgotPasswordSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="reset-email">Email Address</label>
              <div className="input-with-icon">
                <Mail size={16} className="field-icon" />
                <input 
                  id="reset-email"
                  type="email" 
                  placeholder="admin@school.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? "Sending link..." : "Send Password Reset Link"}
            </button>

            <div style={{ display: "flex", justifyContent: "center", marginTop: "4px" }}>
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); setView("login"); setError(null); setSuccess(null); }}
                className="back-link"
              >
                Back to Sign In
              </a>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .login-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          width: 100vw;
          background-color: var(--bg-base, #060913);
          color: var(--text-primary, #f1f5f9);
          font-family: var(--font-sans), sans-serif;
          position: relative;
          overflow: hidden;
          padding: 40px var(--spacing-md);
        }

        .background-stars {
          position: absolute;
          inset: 0;
          background-image: 
            radial-gradient(1px 1px at 20px 30px, #ffffff1a, rgba(0,0,0,0)),
            radial-gradient(2px 2px at 40px 80px, #ffffff33, rgba(0,0,0,0)),
            radial-gradient(1.5px 1.5px at 150px 140px, #ffffff26, rgba(0,0,0,0));
          background-size: 200px 200px;
          opacity: 0.5;
          pointer-events: none;
        }

        .glass-login-card {
          width: 100%;
          max-width: 440px;
          padding: 40px;
          border-radius: 20px;
          background: var(--glass-bg, rgba(12, 17, 34, 0.75));
          border: 1px solid var(--glass-border, rgba(30, 41, 59, 0.6));
          backdrop-filter: var(--glass-blur, blur(16px));
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
          gap: 24px;
          z-index: 5;
          box-sizing: border-box;
        }

        .login-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .logo-badge {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: 6px 12px;
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid var(--border-default, #1e293b);
          border-radius: 50px;
        }

        .logo-icon {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, var(--accent-primary, #10b981), var(--accent-secondary, #6366f1));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 0.75rem;
        }

        .logo-text {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: linear-gradient(to right, #ffffff, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .login-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.025em;
          background: linear-gradient(to right, #ffffff, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          font-size: 0.85rem;
          color: var(--text-muted, #64748b);
        }

        .sandbox-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px var(--spacing-md);
          background: rgba(234, 179, 8, 0.08);
          border: 1px solid rgba(234, 179, 8, 0.2);
          border-radius: 8px;
          font-size: 0.8rem;
          color: var(--state-warning, #eab308);
        }

        .view-title-container {
          text-align: left;
        }

        .view-title {
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--text-primary, #f1f5f9);
          margin-bottom: 4px;
        }

        .view-subtitle {
          font-size: 0.8rem;
          color: var(--text-muted, #64748b);
        }

        .status-banner {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: 12px var(--spacing-md);
          border-radius: 8px;
          font-size: 0.85rem;
        }

        .error-banner {
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.2);
          color: var(--state-error, #f43f5e);
        }

        .success-banner {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--state-success, #10b981);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-group label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted, #64748b);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .text-link {
          font-size: 0.8rem;
          color: var(--accent-secondary, #6366f1);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .text-link:hover {
          color: #818cf8;
          text-decoration: underline;
        }

        .back-link {
          font-size: 0.85rem;
          color: var(--text-muted, #64748b);
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .back-link:hover {
          color: var(--text-primary, #f1f5f9);
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted, #64748b);
          pointer-events: none;
        }

        .input-with-icon input {
          width: 100%;
          padding: 12px 12px 12px 38px;
          background: rgba(12, 17, 34, 0.6);
          border: 1px solid var(--border-default, #1e293b);
          border-radius: 8px;
          color: var(--text-primary, #f1f5f9);
          font-size: 0.9rem;
          transition: all 0.2s ease;
          outline: none;
          box-sizing: border-box;
        }

        .input-with-icon input:focus {
          border-color: var(--accent-primary, #10b981);
          background: rgba(21, 28, 54, 0.8);
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
        }

        .submit-btn {
          margin-top: 8px;
          padding: 14px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--accent-primary, #10b981), var(--accent-secondary, #6366f1));
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
        }

        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

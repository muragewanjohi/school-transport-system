"use client";

import React, { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { Lock, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      if (!isSupabaseConfigured) {
        setHasSession(true);
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // If there's no session established by the password-reset flow,
        // redirect them back to login page.
        setError("Password reset token is invalid or expired. Redirecting...");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        setHasSession(true);
      }
    };
    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    if (!password || !confirmPassword) {
      setError("Please fill in all fields.");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        setSuccess("Sandbox Mode: Password reset simulated successfully!");
        setTimeout(() => {
          router.push("/login");
        }, 1500);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateErr) {
        setError(updateErr.message);
      } else {
        setSuccess("Password updated successfully! Redirecting to login...");
        setTimeout(() => {
          // Log out the user to force them to sign in with their new credentials
          supabase.auth.signOut().then(() => {
            router.push("/login");
          });
        }, 2000);
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
        <div className="login-header">
          <div className="logo-badge">
            <div className="logo-icon">S</div>
            <span className="logo-text">Safaricom Track</span>
          </div>
          <h1>Reset Account Password</h1>
          <p className="subtitle">Secure your admin command center credentials</p>
        </div>

        {error && (
          <div className="status-banner error-banner">
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="status-banner success-banner">
            <Sparkles size={16} />
            <span>{success}</span>
          </div>
        )}

        {hasSession && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="new-password">New Password</label>
              <div className="input-with-icon">
                <Lock size={16} className="field-icon" />
                <input 
                  id="new-password"
                  type="password" 
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="confirm-password">Confirm Password</label>
              <div className="input-with-icon">
                <Lock size={16} className="field-icon" />
                <input 
                  id="confirm-password"
                  type="password" 
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? "Saving changes..." : "Save & Update Password"}
            </button>
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

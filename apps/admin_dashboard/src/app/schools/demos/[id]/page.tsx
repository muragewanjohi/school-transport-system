"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";
import {
  clearDemoProvisionCredentials,
  loadDemoProvisionCredentials,
  saveDemoProvisionCredentials,
  type DemoProvisionCredentials,
} from "@/lib/demoRequestCredentials";

type DemoRequestStatus = "pending" | "confirmed" | "completed" | "declined";

type DemoRequestDetail = {
  id: string;
  full_name: string;
  role: string;
  school_name: string;
  country: string;
  city: string;
  phone: string;
  email: string | null;
  fleet_size: string;
  preferred_time: string;
  notes: string | null;
  status: DemoRequestStatus;
  reviewed_at: string | null;
  created_at: string;
  provisioned_tenant_id?: string | null;
  demo_slug?: string | null;
  demo_expires_at?: string | null;
  demo_school_url?: string | null;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: DemoRequestStatus): "success" | "warning" | "error" | "muted" {
  if (status === "confirmed" || status === "completed") return "success";
  if (status === "declined") return "error";
  if (status === "pending") return "warning";
  return "muted";
}

export default function DemoRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const isPlatformAdmin = profile?.role === "super_admin";

  const [request, setRequest] = useState<DemoRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<DemoProvisionCredentials | null>(null);
  const [lastEmailSent, setLastEmailSent] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    role: "Transport Manager",
    school_name: "",
    country: "",
    city: "",
    phone: "",
    email: "",
    fleet_size: "1-5",
    preferred_time: "This week",
    notes: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isPlatformAdmin) {
      router.replace("/login?reason=use-school-subdomain");
    }
  }, [authLoading, isPlatformAdmin, router]);

  const loadRequest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo-requests?id=${encodeURIComponent(requestId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to load demo request");
        setRequest(null);
        return;
      }
      const data = json.data as DemoRequestDetail;
      setRequest(data);
      setForm({
        full_name: data.full_name,
        role: data.role,
        school_name: data.school_name,
        country: data.country,
        city: data.city,
        phone: data.phone,
        email: data.email || "",
        fleet_size: data.fleet_size,
        preferred_time: data.preferred_time,
        notes: data.notes || "",
      });
      setCredentials(loadDemoProvisionCredentials(data.id));
    } catch {
      setError("Network error loading demo request");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!isPlatformAdmin || authLoading) return;
    void loadRequest();
  }, [isPlatformAdmin, authLoading, loadRequest]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast(`Could not copy ${label}`);
    }
  };

  const saveFields = async () => {
    if (!request || request.status !== "pending") return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          fields: {
            ...form,
            notes: form.notes || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to save");
        return;
      }
      setRequest((prev) => (prev ? { ...prev, ...(json.data as DemoRequestDetail) } : prev));
      showToast("Request updated");
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (status: DemoRequestStatus) => {
    if (!request) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to update status");
        return;
      }

      const data = json.data as DemoRequestDetail;
      setRequest((prev) => (prev ? { ...prev, ...data } : data));

      if (status === "confirmed" && json.credentials) {
        const creds = json.credentials as DemoProvisionCredentials;
        saveDemoProvisionCredentials(request.id, creds);
        setCredentials(creds);
        setLastEmailSent(Boolean(json.provision_email_sent));
        showToast(
          json.provision_email_sent
            ? "Provisioned — access details emailed to the requester"
            : "Provisioned — credentials shown below (email not sent; check RESEND_API_KEY)"
        );
      } else if (status === "completed") {
        clearDemoProvisionCredentials(request.id);
        setCredentials(null);
        setLastEmailSent(null);
        showToast("Demo store purged");
      } else if (status === "declined") {
        clearDemoProvisionCredentials(request.id);
        setCredentials(null);
        setLastEmailSent(null);
        showToast("Request declined");
      }

      await loadRequest();
    } catch {
      setError("Network error while updating status");
    } finally {
      setActing(false);
    }
  };

  const resendAccessEmail = async () => {
    if (!request || request.status !== "confirmed") return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, action: "resend_access_email" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "Failed to resend access email");
        return;
      }
      if (json.credentials) {
        const creds = json.credentials as DemoProvisionCredentials;
        saveDemoProvisionCredentials(request.id, creds);
        setCredentials(creds);
      }
      setLastEmailSent(Boolean(json.provision_email_sent));
      showToast(
        json.provision_email_sent
          ? "Access details resent to the requester (admin password reset)"
          : "Password reset — email not sent (check RESEND_API_KEY)"
      );
      await loadRequest();
    } catch {
      setError("Network error while resending access email");
    } finally {
      setActing(false);
    }
  };

  if (authLoading || !isPlatformAdmin) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="main-content" style={{ padding: 32 }}>
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </main>
      </div>
    );
  }

  const editable = request?.status === "pending";
  const schoolUrl = credentials?.school_url || request?.demo_school_url || "";

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <header className="top-header demo-detail-header">
          <div className="demo-detail-heading">
            <Link href="/schools?tab=demos" className="back-link" aria-label="Back to demo requests">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="demo-detail-eyebrow">Demo request</p>
              <h1>{request?.school_name || "Loading…"}</h1>
              <p className="demo-detail-sub">
                {request
                  ? `${request.full_name} · ${request.city}, ${request.country}`
                  : "Lead details and provisioned store access"}
              </p>
            </div>
          </div>
          <UserProfileBadge />
        </header>

        {toast && (
          <div className="demo-toast" role="status">
            <CheckCircle2 size={16} />
            {toast}
          </div>
        )}

        {loading ? (
          <div className="demo-detail-loading">
            <Loader2 size={18} className="spin" /> Loading request…
          </div>
        ) : error && !request ? (
          <div className="demo-detail-body">
            <div className="form-banner error">
              <CircleAlert size={16} />
              {error}
            </div>
          </div>
        ) : request ? (
          <div className="demo-detail-body">
            {error && (
              <div className="form-banner error">
                <CircleAlert size={16} />
                {error}
              </div>
            )}

            <div className="demo-detail-layout">
              <section className="form-card">
                <div className="form-card-title">
                  <UserRound size={15} />
                  Lead details
                </div>

                <div className="demo-meta-row">
                  <span className={`demo-status-pill ${statusTone(request.status)}`}>
                    {request.status}
                  </span>
                  <span className="demo-meta-dates">
                    Submitted {formatDateTime(request.created_at)}
                    {request.reviewed_at ? ` · Reviewed ${formatDateTime(request.reviewed_at)}` : ""}
                  </span>
                </div>

                <div className="form-grid">
                  {(
                    [
                      ["full_name", "Full name"],
                      ["email", "Email"],
                      ["phone", "Phone"],
                      ["school_name", "School"],
                      ["country", "Country"],
                      ["city", "City / area"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="form-field">
                      <label className="form-label" htmlFor={`demo-${key}`}>
                        {label}
                      </label>
                      <input
                        id={`demo-${key}`}
                        className="form-input"
                        disabled={!editable || saving}
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}

                  <div className="form-field">
                    <label className="form-label" htmlFor="demo-role">
                      Role
                    </label>
                    <select
                      id="demo-role"
                      className="form-input"
                      disabled={!editable || saving}
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      {["Transport Manager", "School Admin", "Principal", "Other"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label" htmlFor="demo-fleet">
                      Fleet size
                    </label>
                    <select
                      id="demo-fleet"
                      className="form-input"
                      disabled={!editable || saving}
                      value={form.fleet_size}
                      onChange={(e) => setForm((f) => ({ ...f, fleet_size: e.target.value }))}
                    >
                      {["1-5", "6-15", "16+"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label" htmlFor="demo-time">
                      Preferred time
                    </label>
                    <select
                      id="demo-time"
                      className="form-input"
                      disabled={!editable || saving}
                      value={form.preferred_time}
                      onChange={(e) => setForm((f) => ({ ...f, preferred_time: e.target.value }))}
                    >
                      {["ASAP", "This week", "Next week"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field span-2">
                    <label className="form-label" htmlFor="demo-notes">
                      Notes
                    </label>
                    <textarea
                      id="demo-notes"
                      className="form-input demo-notes"
                      rows={3}
                      disabled={!editable || saving}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-actions demo-actions">
                  {request.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={saving}
                        onClick={() => void saveFields()}
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost danger"
                        disabled={acting}
                        onClick={() => void updateStatus("declined")}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={acting}
                        onClick={() => void updateStatus("confirmed")}
                      >
                        {acting ? (
                          <>
                            <Loader2 size={16} className="spin" /> Provisioning…
                          </>
                        ) : (
                          <>
                            <Building2 size={16} /> Confirm & provision
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {request.status === "confirmed" && (
                    <>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={acting || !request.email}
                        onClick={() => void resendAccessEmail()}
                      >
                        {acting ? (
                          <>
                            <Loader2 size={16} className="spin" /> Working…
                          </>
                        ) : (
                          <>
                            <Send size={16} /> Resend access email
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost danger"
                        disabled={acting}
                        onClick={() => void updateStatus("completed")}
                      >
                        {acting ? (
                          <>
                            <Loader2 size={16} className="spin" /> Purging…
                          </>
                        ) : (
                          <>
                            <Trash2 size={16} /> Complete & purge
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </section>

              {(credentials || schoolUrl) && (
                <section className="form-card demo-access-card">
                  <div className="form-card-title">
                    <KeyRound size={15} />
                    Demo store access
                  </div>

                  <p className="form-hint demo-access-hint">
                    {lastEmailSent === true
                      ? `Access details were emailed to ${request.email || "the requester"}. Admin password is not stored — copy it below if needed.`
                      : lastEmailSent === false
                        ? `Email to ${request.email || "the requester"} was not sent. Use Resend access email after verifying RESEND_API_KEY / DEMO_REQUESTS_FROM_EMAIL.`
                        : `Use Resend access email to mail ${request.email || "the requester"} (resets the admin password). Password only appears in this browser session after Confirm or Resend.`}
                  </p>

                  <div className="demo-cred-list">
                    <CredRow
                      label="School URL"
                      value={schoolUrl}
                      href={schoolUrl || undefined}
                      onCopy={() => void copyText("URL", schoolUrl)}
                    />
                    {credentials ? (
                      <>
                        <CredRow
                          label="Admin email"
                          value={credentials.admin_email}
                          onCopy={() => void copyText("Admin email", credentials.admin_email)}
                        />
                        <CredRow
                          label="Admin password"
                          value={credentials.admin_password}
                          mono
                          secret
                          onCopy={() => void copyText("Password", credentials.admin_password)}
                        />
                        <CredRow
                          label="Flutter phone"
                          value={credentials.phone}
                          onCopy={() => void copyText("Phone", credentials.phone)}
                        />
                        <CredRow
                          label="Flutter OTP"
                          value={credentials.otp}
                          mono
                          secret
                          onCopy={() => void copyText("OTP", credentials.otp)}
                        />
                        <CredRow
                          label="Expires"
                          value={formatDateTime(credentials.expires_at)}
                        />
                      </>
                    ) : (
                      <div className="demo-cred-empty">
                        <p>
                          Store slug <code>{request.demo_slug}</code>
                          {request.demo_expires_at
                            ? ` · expires ${formatDateTime(request.demo_expires_at)}`
                            : ""}
                          .
                        </p>
                        <p>
                          Full admin password is only available after Confirm or Resend in this
                          browser session.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="demo-access-foot">
                    <span>
                      <Mail size={14} /> Emails go to {request.email || "requester"}
                    </span>
                    <span>
                      <Phone size={14} /> Same phone + OTP for parent & driver apps
                    </span>
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : null}
      </main>

      <style>{`
        .demo-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .demo-detail-heading {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .demo-detail-eyebrow {
          margin: 0;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-primary);
        }
        .demo-detail-heading h1 {
          margin: 2px 0 0;
          font-size: 1.35rem;
          font-weight: 650;
          letter-spacing: -0.02em;
        }
        .demo-detail-sub {
          margin: 4px 0 0;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .back-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          background: var(--bg-surface);
          transition: border-color 0.15s ease, background 0.15s ease;
          text-decoration: none;
          flex-shrink: 0;
        }
        .back-link:hover {
          background: var(--bg-surface-hover);
          border-color: var(--text-muted);
        }

        .demo-toast {
          margin: 0 24px 8px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: var(--text-primary);
          font-size: 0.88rem;
        }

        .demo-detail-loading {
          padding: 32px 24px;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .demo-detail-body {
          padding: 8px 24px 40px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .demo-detail-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
          gap: 16px;
          align-items: start;
          width: min(1100px, 100%);
        }
        @media (max-width: 960px) {
          .demo-detail-layout { grid-template-columns: 1fr; }
        }

        .form-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 0.88rem;
          width: min(1100px, 100%);
        }
        .form-banner.error {
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.4);
          color: var(--state-error);
        }

        .form-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .demo-access-card {
          border-color: rgba(16, 185, 129, 0.28);
          background:
            linear-gradient(165deg, rgba(16, 185, 129, 0.08), transparent 42%),
            var(--bg-surface);
        }
        .form-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent-primary);
        }

        .demo-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding-bottom: 4px;
        }
        .demo-status-pill {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 650;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border: 1px solid transparent;
        }
        .demo-status-pill.success {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.14);
          border-color: rgba(16, 185, 129, 0.35);
        }
        .demo-status-pill.warning {
          color: #fde68a;
          background: rgba(234, 179, 8, 0.12);
          border-color: rgba(234, 179, 8, 0.35);
        }
        .demo-status-pill.error {
          color: #fda4af;
          background: rgba(244, 63, 94, 0.12);
          border-color: rgba(244, 63, 94, 0.35);
        }
        .demo-meta-dates {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .form-field { display: flex; flex-direction: column; gap: 6px; }
        .form-field.span-2 { grid-column: span 2; }
        @media (max-width: 640px) {
          .form-grid { grid-template-columns: 1fr; }
          .form-field.span-2 { grid-column: span 1; }
        }
        .form-label { font-size: 0.78rem; color: var(--text-muted); }
        .form-input {
          width: 100%;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 0.9rem;
          transition: border-color 0.15s ease, opacity 0.15s ease;
        }
        .form-input:focus { outline: none; border-color: var(--accent-primary); }
        .form-input:disabled {
          opacity: 0.78;
          cursor: default;
          color: var(--text-primary);
        }
        .demo-notes { resize: vertical; min-height: 84px; }
        .form-hint { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.45; }
        .demo-access-hint { margin-top: -4px; }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          padding-top: 4px;
        }
        .demo-actions { border-top: 1px solid var(--border-default); padding-top: 14px; margin-top: 2px; }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--accent-primary);
          color: #04110a;
          border: none;
          border-radius: 10px;
          padding: 10px 16px;
          font-weight: 600;
          font-size: 0.88rem;
          font-family: inherit;
          cursor: pointer;
          transition: filter 0.15s ease;
        }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 10px;
          padding: 10px 16px;
          font-size: 0.88rem;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .btn-ghost:hover { background: var(--bg-surface-hover); }
        .btn-ghost:disabled { opacity: 0.55; cursor: not-allowed; }
        .btn-ghost.danger {
          border-color: rgba(244, 63, 94, 0.4);
          color: #fda4af;
        }
        .btn-ghost.danger:hover {
          background: rgba(244, 63, 94, 0.1);
        }
        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-base);
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }
        .btn-icon:hover {
          color: var(--text-primary);
          border-color: var(--text-muted);
          background: var(--bg-surface-hover);
        }

        .demo-cred-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .demo-cred-row {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(6, 9, 19, 0.55);
          border: 1px solid var(--border-default);
        }
        .demo-cred-label {
          font-size: 0.74rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .demo-cred-value {
          min-width: 0;
          word-break: break-all;
          font-size: 0.88rem;
          color: var(--text-primary);
        }
        .demo-cred-value.mono {
          font-family: var(--font-mono), monospace;
          font-size: 0.84rem;
          letter-spacing: 0.02em;
        }
        .demo-cred-value.secret {
          color: #a7f3d0;
        }
        .demo-cred-value a {
          color: #93c5fd;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .demo-cred-value a:hover { text-decoration: underline; }
        .demo-cred-empty {
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 10px;
          border: 1px dashed var(--border-default);
          color: var(--text-muted);
          font-size: 0.84rem;
          line-height: 1.45;
        }
        .demo-cred-empty code {
          font-family: var(--font-mono), monospace;
          color: var(--accent-primary);
        }
        .demo-access-foot {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          padding-top: 4px;
          color: var(--text-muted);
          font-size: 0.78rem;
        }
        .demo-access-foot span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .spin { animation: demo-spin 0.9s linear infinite; }
        @keyframes demo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function CredRow({
  label,
  value,
  href,
  mono,
  secret,
  onCopy,
}: Readonly<{
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  secret?: boolean;
  onCopy?: () => void;
}>) {
  if (!value) return null;
  const valueClass = ["demo-cred-value", mono ? "mono" : "", secret ? "secret" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="demo-cred-row">
      <span className="demo-cred-label">{label}</span>
      <div className={valueClass}>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {value}
            <ExternalLink size={12} />
          </a>
        ) : (
          value
        )}
      </div>
      {onCopy ? (
        <button type="button" className="btn-icon" onClick={onCopy} title={`Copy ${label}`}>
          <Copy size={14} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

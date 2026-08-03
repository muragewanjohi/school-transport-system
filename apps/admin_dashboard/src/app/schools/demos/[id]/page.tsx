"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  CircleCheck,
  CircleAlert,
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
        showToast(
          json.provision_email_sent
            ? "Provisioned — credentials emailed and shown below"
            : "Provisioned — credentials shown below (email not sent)"
        );
      } else if (status === "completed") {
        clearDemoProvisionCredentials(request.id);
        setCredentials(null);
        showToast("Demo store purged");
      } else if (status === "declined") {
        clearDemoProvisionCredentials(request.id);
        setCredentials(null);
        showToast("Request declined");
      }

      await loadRequest();
    } catch {
      setError("Network error while updating status");
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

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <header
          className="top-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <Link
              href="/schools?tab=demos"
              className="btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 8 }}
            >
              <ArrowLeft size={16} /> Back to demo requests
            </Link>
            <h1 style={{ margin: 0 }}>Demo request</h1>
            <p className="cell-muted" style={{ margin: "6px 0 0" }}>
              {request?.school_name || "…"}
            </p>
          </div>
          <UserProfileBadge />
        </header>

        {toast && (
          <div
            role="status"
            style={{
              margin: "0 32px 12px",
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "var(--text-primary)",
            }}
          >
            {toast}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 32, color: "var(--text-muted)" }}>
            <Loader2 size={18} className="spin" /> Loading request…
          </div>
        ) : error && !request ? (
          <div style={{ padding: 32 }}>
            <p style={{ color: "var(--state-error)" }}>{error}</p>
          </div>
        ) : request ? (
          <div style={{ padding: "0 32px 40px", display: "grid", gap: 24, maxWidth: 960 }}>
            {error && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(244, 63, 94, 0.1)",
                  color: "var(--state-error)",
                }}
              >
                <CircleAlert size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />
                {error}
              </div>
            )}

            <section
              className="data-table-wrap"
              style={{ padding: 20, display: "grid", gap: 16 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="cell-muted">Status</div>
                  <span
                    className={`status-badge ${
                      request.status === "confirmed" || request.status === "completed"
                        ? "success"
                        : request.status === "declined"
                          ? "error"
                          : "warning"
                    }`}
                  >
                    {request.status}
                  </span>
                </div>
                <div className="cell-muted">
                  Submitted {formatDateTime(request.created_at)}
                  {request.reviewed_at ? ` · Reviewed ${formatDateTime(request.reviewed_at)}` : ""}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
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
                  <label key={key} style={{ display: "grid", gap: 6 }}>
                    <span className="cell-muted">{label}</span>
                    <input
                      className="input"
                      disabled={request.status !== "pending" || saving}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}

                <label style={{ display: "grid", gap: 6 }}>
                  <span className="cell-muted">Role</span>
                  <select
                    className="input"
                    disabled={request.status !== "pending" || saving}
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {["Transport Manager", "School Admin", "Principal", "Other"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span className="cell-muted">Fleet size</span>
                  <select
                    className="input"
                    disabled={request.status !== "pending" || saving}
                    value={form.fleet_size}
                    onChange={(e) => setForm((f) => ({ ...f, fleet_size: e.target.value }))}
                  >
                    {["1-5", "6-15", "16+"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span className="cell-muted">Preferred time</span>
                  <select
                    className="input"
                    disabled={request.status !== "pending" || saving}
                    value={form.preferred_time}
                    onChange={(e) => setForm((f) => ({ ...f, preferred_time: e.target.value }))}
                  >
                    {["ASAP", "This week", "Next week"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="cell-muted">Notes</span>
                <textarea
                  className="input"
                  rows={3}
                  disabled={request.status !== "pending" || saving}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {request.status === "pending" && (
                  <>
                    <button className="btn-ghost" disabled={saving} onClick={() => void saveFields()}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      className="btn-ghost accent"
                      disabled={acting}
                      onClick={() => void updateStatus("confirmed")}
                    >
                      {acting ? "Provisioning…" : "Confirm & provision"}
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={acting}
                      onClick={() => void updateStatus("declined")}
                    >
                      Decline
                    </button>
                  </>
                )}
                {request.status === "confirmed" && (
                  <button
                    className="btn-ghost accent"
                    disabled={acting}
                    onClick={() => void updateStatus("completed")}
                  >
                    {acting ? "Purging…" : "Complete & purge"}
                  </button>
                )}
              </div>
            </section>

            {(credentials || request.demo_school_url) && (
              <section
                className="data-table-wrap"
                style={{
                  padding: 20,
                  display: "grid",
                  gap: 14,
                  borderColor: "rgba(16, 185, 129, 0.35)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CircleCheck size={18} color="var(--accent-primary)" />
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Demo store access</h2>
                </div>
                <p className="cell-muted" style={{ margin: 0 }}>
                  Credentials are shown once after provision (also emailed). Password is not stored in
                  the database — copy it now if the email is delayed.
                </p>

                <CredRow
                  label="School URL"
                  value={credentials?.school_url || request.demo_school_url || ""}
                  href={credentials?.school_url || request.demo_school_url || undefined}
                  onCopy={() =>
                    void copyText(
                      "URL",
                      credentials?.school_url || request.demo_school_url || ""
                    )
                  }
                />
                {credentials && (
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
                      onCopy={() => void copyText("OTP", credentials.otp)}
                    />
                    <CredRow
                      label="Expires"
                      value={formatDateTime(credentials.expires_at)}
                    />
                  </>
                )}
                {!credentials && request.demo_slug && (
                  <p className="cell-muted" style={{ margin: 0 }}>
                    Slug: <code>{request.demo_slug}</code>
                    {request.demo_expires_at
                      ? ` · Expires ${formatDateTime(request.demo_expires_at)}`
                      : ""}
                    . Full admin password is only available immediately after Confirm in this browser
                    session.
                  </p>
                )}

                <div className="cell-muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Mail size={14} /> Email to requester
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Phone size={14} /> Same phone + OTP for parent & driver apps
                  </span>
                </div>
              </section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function CredRow({
  label,
  value,
  href,
  mono,
  onCopy,
}: Readonly<{
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  onCopy?: () => void;
}>) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span className="cell-muted">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
          {value} <ExternalLink size={12} style={{ verticalAlign: "middle" }} />
        </a>
      ) : (
        <code
          style={{
            wordBreak: "break-all",
            fontFamily: mono ? "var(--font-mono), monospace" : "inherit",
          }}
        >
          {value}
        </code>
      )}
      {onCopy ? (
        <button type="button" className="btn-ghost" onClick={onCopy} title={`Copy ${label}`}>
          <Copy size={14} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

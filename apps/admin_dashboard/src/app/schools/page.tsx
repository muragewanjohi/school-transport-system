"use client";

import React, { useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Edit,
  X,
  Mail,
  Phone,
  MapPin,
  Search,
  Banknote,
  Sparkles,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface SchoolRow {
  id: string;
  name: string;
  domain: string;
  status: "active" | "suspended";
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  campus: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  } | null;
  campus_monthly_fee_kes: number;
  platform_fee_kes: number;
  active_campus_count: number;
  students_count: number;
}

const emptyForm = {
  name: "",
  domain: "",
  contact_email: "",
  contact_phone: "",
  campus_name: "",
  campus_latitude: "-1.2921",
  campus_longitude: "36.8219",
  campus_monthly_fee_kes: "10000",
  admin_name: "",
  admin_email: "",
  admin_phone: "",
  status: "active" as "active" | "suspended",
};

export default function SchoolsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPlatformAdmin = profile?.role === "super_admin";

  useEffect(() => {
    if (authLoading) return;
    if (!isPlatformAdmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, isPlatformAdmin, router]);

  const fetchSchools = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenants");
      const json = await res.json();
      if (json.success) {
        setSchools(json.data as SchoolRow[]);
      } else {
        console.error(json.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      void fetchSchools();
    }
  }, [isPlatformAdmin]);

  const filtered = schools.filter((school) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      school.name.toLowerCase().includes(q) ||
      school.domain.toLowerCase().includes(q) ||
      (school.contact_email || "").toLowerCase().includes(q)
    );
  });

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "School name is required";
    if (!formValues.domain.trim()) {
      errors.domain = "Domain slug is required";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formValues.domain.trim())) {
      errors.domain = "Use lowercase slug like acme-academy";
    }
    const fee = Number(formValues.campus_monthly_fee_kes);
    if (!Number.isFinite(fee) || fee < 0) {
      errors.campus_monthly_fee_kes = "Enter a valid fee in KES";
    }
    if (drawerMode === "add") {
      if (!formValues.admin_name.trim()) errors.admin_name = "Admin name is required";
      if (!formValues.admin_email.trim()) {
        errors.admin_email = "Invite email is required";
      } else if (!/\S+@\S+\.\S+/.test(formValues.admin_email)) {
        errors.admin_email = "Enter a valid email";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAdd = () => {
    setDrawerMode("add");
    setEditingId(null);
    setFormValues(emptyForm);
    setFormErrors({});
    setShowDrawer(true);
  };

  const openEdit = (school: SchoolRow) => {
    setDrawerMode("edit");
    setEditingId(school.id);
    setFormValues({
      name: school.name,
      domain: school.domain,
      contact_email: school.contact_email || "",
      contact_phone: school.contact_phone || "",
      campus_name: school.campus?.name || "",
      campus_latitude: String(school.campus?.latitude ?? -1.2921),
      campus_longitude: String(school.campus?.longitude ?? 36.8219),
      campus_monthly_fee_kes: String(school.campus_monthly_fee_kes ?? 10000),
      admin_name: "",
      admin_email: "",
      admin_phone: "",
      status: school.status,
    });
    setFormErrors({});
    setShowDrawer(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      if (drawerMode === "add") {
        const res = await fetch("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formValues.name.trim(),
            domain: formValues.domain.trim(),
            contact_email: formValues.contact_email.trim(),
            contact_phone: formValues.contact_phone.trim(),
            campus_name: formValues.campus_name.trim() || undefined,
            campus_latitude: Number(formValues.campus_latitude),
            campus_longitude: Number(formValues.campus_longitude),
            campus_monthly_fee_kes: Number(formValues.campus_monthly_fee_kes),
            admin_name: formValues.admin_name.trim(),
            admin_email: formValues.admin_email.trim(),
            admin_phone: formValues.admin_phone.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.error || "Failed to create school");
          return;
        }
        if (json.warning) {
          alert(json.warning);
        } else {
          alert("School onboarded. Invite email sent to the first school admin.");
        }
      } else if (editingId) {
        const res = await fetch(`/api/tenants/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formValues.name.trim(),
            domain: formValues.domain.trim(),
            status: formValues.status,
            contact_email: formValues.contact_email.trim(),
            contact_phone: formValues.contact_phone.trim(),
            campus_name: formValues.campus_name.trim() || undefined,
            campus_latitude: Number(formValues.campus_latitude),
            campus_longitude: Number(formValues.campus_longitude),
            campus_monthly_fee_kes: Number(formValues.campus_monthly_fee_kes),
          }),
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.error || "Failed to update school");
          return;
        }
        alert("School updated.");
      }

      setShowDrawer(false);
      await fetchSchools();
    } catch (err) {
      console.error(err);
      alert("Unexpected error while saving school.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSoftDelete = async (school: SchoolRow) => {
    if (!confirm(`Soft-delete ${school.name}? This suspends the school and frees the domain.`)) {
      return;
    }
    const res = await fetch(`/api/tenants/${school.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      alert(json.error || "Failed to delete school");
      return;
    }
    await fetchSchools();
  };

  if (authLoading || !isPlatformAdmin) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <main className="main-content" style={{ padding: 32 }}>
          <p style={{ color: "var(--text-muted)" }}>Checking platform access...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <header className="top-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", display: "flex", alignItems: "center", gap: 10 }}>
              <Building2 size={22} color="var(--accent-primary)" />
              Schools
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Platform onboarding — each school gets{" "}
              <code style={{ color: "var(--accent-primary)" }}>{"{slug}.onthebusapp.com"}</code>
            </p>
          </div>
          <UserProfileBadge />
        </header>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "var(--text-muted)" }} />
              <input
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Search schools..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn-primary" onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Plus size={16} />
              Onboard School
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div className="stat-card">
              <span className="stat-label">Active schools</span>
              <strong className="stat-value">{schools.filter((s) => s.status === "active").length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Suspended</span>
              <strong className="stat-value">{schools.filter((s) => s.status === "suspended").length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">MRR (platform fees)</span>
              <strong className="stat-value">
                KES {schools.reduce((sum, s) => sum + (s.platform_fee_kes || 0), 0).toLocaleString()}
              </strong>
            </div>
          </div>

          <div className="data-table-wrap">
            {loading ? (
              <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading schools...</p>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <Sparkles size={28} style={{ marginBottom: 12, opacity: 0.6 }} />
                <p>No schools yet. Onboard the first school organization.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Campus</th>
                    <th>Fee / campus</th>
                    <th>Monthly total</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((school) => (
                    <tr key={school.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{school.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{school.domain}</div>
                        {school.contact_email && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                            {school.contact_email}
                          </div>
                        )}
                      </td>
                      <td>{school.campus?.name || "—"}</td>
                      <td>KES {school.campus_monthly_fee_kes.toLocaleString()}</td>
                      <td>KES {school.platform_fee_kes.toLocaleString()}</td>
                      <td>{school.students_count}</td>
                      <td>
                        <span className={`status-badge ${school.status === "active" ? "success" : "warning"}`}>
                          {school.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button className="icon-btn" title="Edit" onClick={() => openEdit(school)}>
                            <Edit size={16} />
                          </button>
                          <button className="icon-btn danger" title="Soft delete" onClick={() => handleSoftDelete(school)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {showDrawer && (
          <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
            <aside className="drawer-panel" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <h2>{drawerMode === "add" ? "Onboard School" : "Edit School"}</h2>
                <button className="icon-btn" onClick={() => setShowDrawer(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label className="form-label">School name *</label>
                <input
                  className={`form-input ${formErrors.name ? "error" : ""}`}
                  value={formValues.name}
                  onChange={(e) => setFormValues((p) => ({ ...p, name: e.target.value }))}
                />
                {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}

                <label className="form-label">Subdomain slug *</label>
                <input
                  className={`form-input ${formErrors.domain ? "error" : ""}`}
                  placeholder="school1"
                  value={formValues.domain}
                  onChange={(e) => setFormValues((p) => ({ ...p, domain: e.target.value.toLowerCase() }))}
                />
                {formErrors.domain && <span className="form-error-text">{formErrors.domain}</span>}
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  School login URL: https://{formValues.domain || "school1"}.onthebusapp.com
                </p>

                <label className="form-label"><Mail size={14} /> Contact email</label>
                <input
                  className="form-input"
                  value={formValues.contact_email}
                  onChange={(e) => setFormValues((p) => ({ ...p, contact_email: e.target.value }))}
                />

                <label className="form-label"><Phone size={14} /> Contact phone</label>
                <input
                  className="form-input"
                  value={formValues.contact_phone}
                  onChange={(e) => setFormValues((p) => ({ ...p, contact_phone: e.target.value }))}
                />

                <label className="form-label"><MapPin size={14} /> Campus name</label>
                <input
                  className="form-input"
                  placeholder="Defaults to School name + Campus"
                  value={formValues.campus_name}
                  onChange={(e) => setFormValues((p) => ({ ...p, campus_name: e.target.value }))}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="form-label">Latitude</label>
                    <input
                      className="form-input"
                      value={formValues.campus_latitude}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_latitude: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Longitude</label>
                    <input
                      className="form-input"
                      value={formValues.campus_longitude}
                      onChange={(e) => setFormValues((p) => ({ ...p, campus_longitude: e.target.value }))}
                    />
                  </div>
                </div>

                <label className="form-label"><Banknote size={14} /> Campus monthly fee (KES) *</label>
                <input
                  className={`form-input ${formErrors.campus_monthly_fee_kes ? "error" : ""}`}
                  value={formValues.campus_monthly_fee_kes}
                  onChange={(e) => setFormValues((p) => ({ ...p, campus_monthly_fee_kes: e.target.value }))}
                />
                {formErrors.campus_monthly_fee_kes && (
                  <span className="form-error-text">{formErrors.campus_monthly_fee_kes}</span>
                )}
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Platform fee = active campuses × this rate. Editable by platform only.
                </p>

                {drawerMode === "edit" && (
                  <>
                    <label className="form-label">Status</label>
                    <select
                      className="form-input"
                      value={formValues.status}
                      onChange={(e) =>
                        setFormValues((p) => ({ ...p, status: e.target.value as "active" | "suspended" }))
                      }
                    >
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </>
                )}

                {drawerMode === "add" && (
                  <>
                    <hr style={{ border: 0, borderTop: "1px solid var(--border-default)", margin: "8px 0" }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>First school admin (email invite)</p>
                    <label className="form-label">Admin name *</label>
                    <input
                      className={`form-input ${formErrors.admin_name ? "error" : ""}`}
                      value={formValues.admin_name}
                      onChange={(e) => setFormValues((p) => ({ ...p, admin_name: e.target.value }))}
                    />
                    {formErrors.admin_name && <span className="form-error-text">{formErrors.admin_name}</span>}

                    <label className="form-label">Invite email *</label>
                    <input
                      className={`form-input ${formErrors.admin_email ? "error" : ""}`}
                      value={formValues.admin_email}
                      onChange={(e) => setFormValues((p) => ({ ...p, admin_email: e.target.value }))}
                    />
                    {formErrors.admin_email && <span className="form-error-text">{formErrors.admin_email}</span>}

                    <label className="form-label">Admin phone</label>
                    <input
                      className="form-input"
                      value={formValues.admin_phone}
                      onChange={(e) => setFormValues((p) => ({ ...p, admin_phone: e.target.value }))}
                    />
                  </>
                )}

                <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ marginTop: 8 }}>
                  {isSubmitting ? "Saving..." : drawerMode === "add" ? "Create & send invite" : "Save changes"}
                </button>
              </form>
            </aside>
          </div>
        )}
      </main>

      <style>{`
        .stat-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .stat-label { color: var(--text-muted); font-size: 0.8rem; }
        .stat-value { font-size: 1.25rem; color: var(--text-primary); }
        .data-table-wrap {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          overflow: auto;
        }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td {
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid var(--border-default);
          font-size: 0.9rem;
        }
        .data-table th { color: var(--text-muted); font-weight: 500; }
        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          text-transform: capitalize;
        }
        .status-badge.success { background: rgba(16,185,129,0.15); color: var(--state-success); }
        .status-badge.warning { background: rgba(234,179,8,0.15); color: var(--state-warning); }
        .icon-btn {
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 6px;
          cursor: pointer;
        }
        .icon-btn.danger { color: var(--state-error); }
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          justify-content: flex-end;
          z-index: 50;
        }
        .drawer-panel {
          width: min(440px, 100%);
          height: 100%;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-default);
          padding: 20px;
          overflow-y: auto;
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .form-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .form-input {
          width: 100%;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .form-input.error { border-color: var(--state-error); }
        .form-error-text { color: var(--state-error); font-size: 0.75rem; }
        .btn-primary {
          background: var(--accent-primary);
          color: #04110a;
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

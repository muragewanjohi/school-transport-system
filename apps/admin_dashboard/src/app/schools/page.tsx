"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Edit,
  MapPin,
  Search,
  Banknote,
  Sparkles,
  Users,
  Bus,
  Route as RouteIcon,
  GraduationCap,
  CreditCard,
  Settings,
  School,
  MessageSquareText,
  CircleCheck,
  CircleAlert,
  ExternalLink,
  Save,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";

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
  vehicles_count: number;
  routes_count: number;
  drivers_count: number;
  is_paid: boolean;
  plan_name: string;
  next_renewal: string | null;
  sms_used_this_month: number;
}

type TabId = "schools" | "billing" | "settings";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export default function SchoolsPage() {
  return (
    <Suspense
      fallback={
        <div className="app-container">
          <Sidebar />
          <main className="main-content" style={{ padding: 32 }}>
            <p style={{ color: "var(--text-muted)" }}>Loading platform console...</p>
          </main>
        </div>
      }
    >
      <PlatformConsole />
    </Suspense>
  );
}

function PlatformConsole() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId = tabParam === "billing" || tabParam === "settings" ? tabParam : "schools";
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [defaultFee, setDefaultFee] = useState("10000");
  const [suspendedPurgeDays, setSuspendedPurgeDays] = useState("90");
  const [deletedPurgeDays, setDeletedPurgeDays] = useState("30");
  const [savingSettings, setSavingSettings] = useState(false);
  const [togglingBillingId, setTogglingBillingId] = useState<string | null>(null);

  const isPlatformAdmin = profile?.role === "super_admin";

  const pushToast = (type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isPlatformAdmin) {
      // Apex /schools is platform-only; school operators use their subdomain
      router.replace("/login?reason=use-school-subdomain");
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
        pushToast("error", json.error || "Failed to load schools");
      }
    } catch {
      pushToast("error", "Network error while loading schools");
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/platform/settings");
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.default_campus_monthly_fee_kes !== undefined) {
          setDefaultFee(String(json.data.default_campus_monthly_fee_kes));
        }
        if (json.data.suspended_purge_days !== undefined) {
          setSuspendedPurgeDays(String(json.data.suspended_purge_days));
        }
        if (json.data.deleted_purge_days !== undefined) {
          setDeletedPurgeDays(String(json.data.deleted_purge_days));
        }
      }
    } catch {
      // Non-blocking: settings tab shows the fallback default
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      void fetchSchools();
      void fetchSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin]);

  const stats = useMemo(() => {
    const active = schools.filter((s) => s.status === "active");
    return {
      activeSchools: active.length,
      suspended: schools.filter((s) => s.status === "suspended").length,
      campuses: schools.reduce((sum, s) => sum + s.active_campus_count, 0),
      students: schools.reduce((sum, s) => sum + s.students_count, 0),
      buses: schools.reduce((sum, s) => sum + s.vehicles_count, 0),
      drivers: schools.reduce((sum, s) => sum + s.drivers_count, 0),
      routes: schools.reduce((sum, s) => sum + s.routes_count, 0),
      mrr: schools.reduce((sum, s) => sum + (s.platform_fee_kes || 0), 0),
      collected: schools.filter((s) => s.is_paid).reduce((sum, s) => sum + s.platform_fee_kes, 0),
      outstanding: schools.filter((s) => !s.is_paid).reduce((sum, s) => sum + s.platform_fee_kes, 0),
      unpaidCount: schools.filter((s) => !s.is_paid).length,
      smsUsed: schools.reduce((sum, s) => sum + (s.sms_used_this_month || 0), 0),
    };
  }, [schools]);

  const filtered = schools.filter((school) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      school.name.toLowerCase().includes(q) ||
      school.domain.toLowerCase().includes(q) ||
      (school.contact_email || "").toLowerCase().includes(q)
    );
  });

  const handleSoftDelete = async (school: SchoolRow) => {
    if (!confirm(`Soft-delete ${school.name}? This suspends the school and frees the domain.`)) {
      return;
    }
    const res = await fetch(`/api/tenants/${school.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      pushToast("error", json.error || "Failed to delete school");
      return;
    }
    pushToast("success", `${school.name} was soft-deleted.`);
    await fetchSchools();
  };

  const handleTogglePaid = async (school: SchoolRow) => {
    setTogglingBillingId(school.id);
    try {
      const res = await fetch(`/api/tenants/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_paid: !school.is_paid }),
      });
      const json = await res.json();
      if (!json.success) {
        pushToast("error", json.error || "Failed to update payment status");
        return;
      }
      pushToast("success", `${school.name} marked as ${school.is_paid ? "unpaid" : "paid"}.`);
      setSchools((prev) =>
        prev.map((s) => (s.id === school.id ? { ...s, is_paid: !school.is_paid } : s))
      );
    } catch {
      pushToast("error", "Network error while updating payment status");
    } finally {
      setTogglingBillingId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = Number(defaultFee);
    const suspendedDays = Number(suspendedPurgeDays);
    const deletedDays = Number(deletedPurgeDays);
    if (!Number.isFinite(fee) || fee < 0) {
      pushToast("error", "Enter a valid default fee in KES");
      return;
    }
    if (!Number.isFinite(suspendedDays) || suspendedDays < 0 || !Number.isFinite(deletedDays) || deletedDays < 0) {
      pushToast("error", "Retention periods must be 0 or more days");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_campus_monthly_fee_kes: fee,
          suspended_purge_days: suspendedDays,
          deleted_purge_days: deletedDays,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        pushToast("error", json.error || "Failed to save settings");
        return;
      }
      pushToast("success", "Platform settings saved.");
    } catch {
      pushToast("error", "Network error while saving settings");
    } finally {
      setSavingSettings(false);
    }
  };

  if (authLoading || !isPlatformAdmin) {
    return (
      <div className="app-container">
        <Sidebar />
        <main className="main-content" style={{ padding: 32 }}>
          <p style={{ color: "var(--text-muted)" }}>Checking platform access...</p>
        </main>
      </div>
    );
  }

  const kpiCards = [
    { label: "Active schools", value: String(stats.activeSchools), icon: School, tone: "primary" },
    { label: "Suspended", value: String(stats.suspended), icon: CircleAlert, tone: stats.suspended > 0 ? "warning" : "muted" },
    { label: "Campuses", value: String(stats.campuses), icon: MapPin, tone: "secondary" },
    { label: "Students", value: stats.students.toLocaleString(), icon: GraduationCap, tone: "secondary" },
    { label: "Buses", value: stats.buses.toLocaleString(), icon: Bus, tone: "secondary" },
    { label: "Drivers", value: stats.drivers.toLocaleString(), icon: Users, tone: "secondary" },
    { label: "Routes", value: stats.routes.toLocaleString(), icon: RouteIcon, tone: "secondary" },
    { label: "MRR (platform fees)", value: formatKes(stats.mrr), icon: Banknote, tone: "primary" },
  ] as const;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "schools", label: "Schools", icon: Building2 },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "settings", label: "Platform Settings", icon: Settings },
  ];

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <header className="top-header platform-header">
          <div>
            <h1 className="platform-title">
              <span className="platform-title-icon">
                <Building2 size={20} />
              </span>
              Platform Console
            </h1>
            <p className="platform-subtitle">
              Onboard and manage school organizations — each school gets{" "}
              <code>{"{slug}"}.onthebusapp.com</code>
            </p>
          </div>
          <UserProfileBadge />
        </header>

        <div className="platform-body">
          {/* KPI stats */}
          <div className="kpi-grid">
            {kpiCards.map((card) => (
              <div key={card.label} className={`kpi-card tone-${card.tone}`}>
                <div className="kpi-icon">
                  <card.icon size={17} />
                </div>
                <div className="kpi-meta">
                  <span className="kpi-label">{card.label}</span>
                  <strong className="kpi-value">{card.value}</strong>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="tab-bar" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => router.push(tab.id === "schools" ? "/schools" : `/schools?tab=${tab.id}`)}
              >
                <tab.icon size={15} />
                {tab.label}
                {tab.id === "billing" && stats.unpaidCount > 0 && (
                  <span className="tab-badge">{stats.unpaidCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* ------------------------------ Schools tab ------------------------------ */}
          {activeTab === "schools" && (
            <>
              <div className="toolbar">
                <div className="search-box">
                  <Search size={15} />
                  <input
                    placeholder="Search by name, slug or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button className="btn-primary" onClick={() => router.push("/schools/new")}>
                  <Plus size={15} />
                  Onboard School
                </button>
              </div>

              <div className="data-table-wrap">
                {loading ? (
                  <div className="table-empty">
                    <p>Loading schools...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="table-empty">
                    <Sparkles size={28} style={{ marginBottom: 12, opacity: 0.6 }} />
                    <p>{search ? "No schools match your search." : "No schools yet. Onboard the first school organization."}</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>Campus</th>
                        <th>Fleet</th>
                        <th className="num">Students</th>
                        <th className="num">Monthly fee</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((school) => (
                        <tr key={school.id}>
                          <td>
                            <div className="school-cell">
                              <div className="school-avatar">{school.name.slice(0, 1).toUpperCase()}</div>
                              <div>
                                <div className="school-name">{school.name}</div>
                                <a
                                  className="school-domain"
                                  href={`https://${school.domain}.onthebusapp.com`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {school.domain}.onthebusapp.com
                                  <ExternalLink size={11} />
                                </a>
                                {school.contact_email && (
                                  <div className="school-contact">{school.contact_email}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="cell-primary">{school.campus?.name || "—"}</div>
                            <div className="cell-muted">
                              {school.active_campus_count} campus{school.active_campus_count === 1 ? "" : "es"}
                            </div>
                          </td>
                          <td>
                            <div className="fleet-chips">
                              <span className="chip" title="Buses">
                                <Bus size={12} /> {school.vehicles_count}
                              </span>
                              <span className="chip" title="Drivers">
                                <Users size={12} /> {school.drivers_count}
                              </span>
                              <span className="chip" title="Routes">
                                <RouteIcon size={12} /> {school.routes_count}
                              </span>
                            </div>
                          </td>
                          <td className="num">{school.students_count.toLocaleString()}</td>
                          <td className="num">
                            <div className="cell-primary mono">{formatKes(school.platform_fee_kes)}</div>
                            <div className="cell-muted">{formatKes(school.campus_monthly_fee_kes)} / campus</div>
                          </td>
                          <td>
                            <span className={`status-badge ${school.status === "active" ? "success" : "warning"}`}>
                              {school.status}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-btn" title="Manage school" onClick={() => router.push(`/schools/${school.id}/edit`)}>
                                <Edit size={15} />
                              </button>
                              <button className="icon-btn danger" title="Soft delete" onClick={() => handleSoftDelete(school)}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ------------------------------ Billing tab ------------------------------ */}
          {activeTab === "billing" && (
            <>
              <div className="billing-cards">
                <div className="kpi-card tone-primary">
                  <div className="kpi-icon"><Banknote size={17} /></div>
                  <div className="kpi-meta">
                    <span className="kpi-label">Monthly recurring revenue</span>
                    <strong className="kpi-value">{formatKes(stats.mrr)}</strong>
                  </div>
                </div>
                <div className="kpi-card tone-primary">
                  <div className="kpi-icon"><CircleCheck size={17} /></div>
                  <div className="kpi-meta">
                    <span className="kpi-label">Collected (paid schools)</span>
                    <strong className="kpi-value">{formatKes(stats.collected)}</strong>
                  </div>
                </div>
                <div className={`kpi-card ${stats.outstanding > 0 ? "tone-warning" : "tone-muted"}`}>
                  <div className="kpi-icon"><CircleAlert size={17} /></div>
                  <div className="kpi-meta">
                    <span className="kpi-label">Outstanding ({stats.unpaidCount} school{stats.unpaidCount === 1 ? "" : "s"})</span>
                    <strong className="kpi-value">{formatKes(stats.outstanding)}</strong>
                  </div>
                </div>
                <div className="kpi-card tone-secondary">
                  <div className="kpi-icon"><MessageSquareText size={17} /></div>
                  <div className="kpi-meta">
                    <span className="kpi-label">SMS sent this month</span>
                    <strong className="kpi-value">{stats.smsUsed.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              <div className="data-table-wrap">
                {loading ? (
                  <div className="table-empty">
                    <p>Loading billing...</p>
                  </div>
                ) : schools.length === 0 ? (
                  <div className="table-empty">
                    <p>No schools to bill yet.</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>Plan</th>
                        <th className="num">Campuses</th>
                        <th className="num">Fee / campus</th>
                        <th className="num">Monthly invoice</th>
                        <th className="num">SMS used</th>
                        <th>Next renewal</th>
                        <th>Payment</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {schools.map((school) => (
                        <tr key={school.id}>
                          <td>
                            <div className="school-name">{school.name}</div>
                            <div className="cell-muted">{school.domain}</div>
                          </td>
                          <td>
                            <span className="chip plan-chip">{school.plan_name}</span>
                          </td>
                          <td className="num">{school.active_campus_count}</td>
                          <td className="num mono">{formatKes(school.campus_monthly_fee_kes)}</td>
                          <td className="num mono cell-primary">{formatKes(school.platform_fee_kes)}</td>
                          <td className="num">{school.sms_used_this_month.toLocaleString()}</td>
                          <td>{formatDate(school.next_renewal)}</td>
                          <td>
                            <span className={`status-badge ${school.is_paid ? "success" : "error"}`}>
                              {school.is_paid ? "paid" : "unpaid"}
                            </span>
                          </td>
                          <td>
                            <button
                              className={`btn-ghost ${school.is_paid ? "" : "accent"}`}
                              disabled={togglingBillingId === school.id}
                              onClick={() => handleTogglePaid(school)}
                            >
                              {togglingBillingId === school.id
                                ? "Saving..."
                                : school.is_paid
                                ? "Mark unpaid"
                                : "Mark paid"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ------------------------------ Settings tab ------------------------------ */}
          {activeTab === "settings" && (
            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="settings-grid">
                <div className="settings-card">
                  <div className="settings-card-head">
                    <Banknote size={17} />
                    <div>
                      <h3>Default campus fee</h3>
                      <p>Applied to newly onboarded schools. Existing schools keep their own rate (editable per school).</p>
                    </div>
                  </div>
                  <label className="form-label" htmlFor="default-fee">
                    Monthly fee per campus (KES)
                  </label>
                  <input
                    id="default-fee"
                    className="form-input mono"
                    inputMode="numeric"
                    value={defaultFee}
                    onChange={(e) => setDefaultFee(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>

                <div className="settings-card">
                  <div className="settings-card-head">
                    <Trash2 size={17} />
                    <div>
                      <h3>Data retention</h3>
                      <p>
                        Lifecycle: suspended schools are soft-deleted after the suspension period; soft-deleted
                        schools are permanently purged after the deletion period. Set 0 to disable a stage.
                      </p>
                    </div>
                  </div>
                  <label className="form-label" htmlFor="suspended-purge-days">
                    Suspended schools — days until soft delete
                  </label>
                  <input
                    id="suspended-purge-days"
                    className="form-input mono"
                    inputMode="numeric"
                    value={suspendedPurgeDays}
                    onChange={(e) => setSuspendedPurgeDays(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  <label className="form-label" htmlFor="deleted-purge-days">
                    Soft-deleted schools — days until permanent purge
                  </label>
                  <input
                    id="deleted-purge-days"
                    className="form-input mono"
                    inputMode="numeric"
                    value={deletedPurgeDays}
                    onChange={(e) => setDeletedPurgeDays(e.target.value.replace(/[^\d]/g, ""))}
                  />
                  <p className="settings-note">
                    Purge runs daily at 02:00 UTC. Permanent purge removes the school and all of its campuses,
                    students, routes and billing records, and releases the subdomain.
                  </p>
                </div>

                <div className="settings-card">
                  <div className="settings-card-head">
                    <CreditCard size={17} />
                    <div>
                      <h3>How billing works</h3>
                      <p>One invoice per school organization.</p>
                    </div>
                  </div>
                  <ul className="settings-list">
                    <li>Platform fee = active campuses × campus monthly rate.</li>
                    <li>SMS usage is billed separately at cost per message.</li>
                    <li>Unpaid invoices suspend the whole school organization.</li>
                    <li>Suspending a school blocks its console and mobile apps.</li>
                  </ul>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={savingSettings} style={{ alignSelf: "flex-start" }}>
                <Save size={15} />
                {savingSettings ? "Saving..." : "Save platform settings"}
              </button>
            </form>
          )}
        </div>

        {/* Toasts */}
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type}`}>
              {toast.type === "success" ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </main>

      <style>{`
        .platform-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .platform-title {
          margin: 0;
          font-size: 1.35rem;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .platform-title-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.12);
          color: var(--accent-primary);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .platform-subtitle {
          margin: 6px 0 0;
          color: var(--text-muted);
          font-size: 0.88rem;
        }
        .platform-subtitle code {
          font-family: var(--font-mono, monospace);
          color: var(--accent-primary);
          font-size: 0.82rem;
        }
        .platform-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* KPI cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
          gap: 12px;
        }
        .billing-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .kpi-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .kpi-card:hover {
          border-color: var(--bg-surface-hover);
          transform: translateY(-1px);
        }
        .kpi-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-card.tone-primary .kpi-icon {
          background: rgba(16, 185, 129, 0.12);
          color: var(--accent-primary);
        }
        .kpi-card.tone-secondary .kpi-icon {
          background: rgba(99, 102, 241, 0.12);
          color: var(--accent-secondary);
        }
        .kpi-card.tone-warning .kpi-icon {
          background: rgba(234, 179, 8, 0.12);
          color: var(--state-warning);
        }
        .kpi-card.tone-muted .kpi-icon {
          background: rgba(100, 116, 139, 0.12);
          color: var(--text-muted);
        }
        .kpi-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .kpi-label {
          color: var(--text-muted);
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .kpi-value {
          font-size: 1.2rem;
          color: var(--text-primary);
          font-weight: 650;
        }

        /* Tabs */
        .tab-bar {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border-default);
        }
        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          padding: 10px 14px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          margin-bottom: -1px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }
        .tab-badge {
          background: rgba(244, 63, 94, 0.15);
          color: var(--state-error);
          font-size: 0.7rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 1px 7px;
        }

        /* Toolbar */
        .toolbar {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .search-box {
          position: relative;
          flex: 1;
          min-width: 240px;
          display: flex;
          align-items: center;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 0 12px;
          gap: 8px;
          color: var(--text-muted);
          transition: border-color 0.15s ease;
        }
        .search-box:focus-within { border-color: var(--accent-primary); }
        .search-box input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          padding: 10px 0;
          font-family: inherit;
          font-size: 0.9rem;
        }

        /* Table */
        .data-table-wrap {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          overflow: auto;
        }
        .table-empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--text-muted);
        }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid var(--border-default);
          font-size: 0.88rem;
          vertical-align: middle;
        }
        .data-table tbody tr:last-child td { border-bottom: none; }
        .data-table tbody tr { transition: background 0.12s ease; }
        .data-table tbody tr:hover { background: var(--bg-surface-hover); }
        .data-table th {
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .data-table .num { text-align: right; }
        .cell-primary { color: var(--text-primary); font-weight: 500; }
        .cell-muted { color: var(--text-muted); font-size: 0.78rem; margin-top: 2px; }
        .mono { font-family: var(--font-mono, monospace); font-size: 0.84rem; }

        .school-cell { display: flex; align-items: center; gap: 12px; }
        .school-avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          color: white;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .school-name { font-weight: 600; color: var(--text-primary); }
        .school-domain {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--accent-primary);
          font-size: 0.78rem;
          font-family: var(--font-mono, monospace);
          text-decoration: none;
          margin-top: 2px;
        }
        .school-domain:hover { text-decoration: underline; }
        .school-contact { color: var(--text-muted); font-size: 0.75rem; margin-top: 2px; }

        .fleet-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 999px;
          padding: 3px 9px;
          font-size: 0.76rem;
        }
        .plan-chip { color: var(--accent-secondary); border-color: rgba(99, 102, 241, 0.35); }

        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.74rem;
          font-weight: 600;
          text-transform: capitalize;
        }
        .status-badge.success { background: rgba(16,185,129,0.14); color: var(--state-success); }
        .status-badge.warning { background: rgba(234,179,8,0.14); color: var(--state-warning); }
        .status-badge.error { background: rgba(244,63,94,0.14); color: var(--state-error); }

        .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .icon-btn {
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 6px;
          cursor: pointer;
          display: inline-flex;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .icon-btn:hover { background: var(--bg-surface-hover); border-color: var(--text-muted); }
        .icon-btn.danger { color: var(--state-error); }
        .icon-btn.danger:hover { border-color: var(--state-error); }

        /* Buttons */
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
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 0.8rem;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .btn-ghost:hover { background: var(--bg-surface-hover); }
        .btn-ghost.accent { color: var(--accent-primary); border-color: rgba(16,185,129,0.4); }
        .btn-ghost:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Settings */
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
          align-items: start;
        }
        .settings-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .settings-card-head {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          color: var(--accent-primary);
        }
        .settings-card-head h3 { margin: 0; font-size: 1rem; color: var(--text-primary); }
        .settings-card-head p { margin: 4px 0 0; font-size: 0.82rem; color: var(--text-muted); }
        .settings-list {
          margin: 0;
          padding-left: 18px;
          color: var(--text-muted);
          font-size: 0.86rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .settings-note {
          margin: 0;
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        /* Settings form controls */
        @keyframes pop-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .form-label {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .form-input {
          width: 100%;
          background: var(--bg-base);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: 8px;
          padding: 10px 12px;
          font-family: inherit;
          font-size: 0.9rem;
          transition: border-color 0.15s ease;
        }
        .form-input:focus { outline: none; border-color: var(--accent-primary); }

        /* Toasts */
        .toast-stack {
          position: fixed;
          bottom: 20px;
          right: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 80;
        }
        .toast {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 0.86rem;
          color: var(--text-primary);
          max-width: 380px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          animation: pop-in 0.18s ease;
        }
        .toast.success { border-color: rgba(16,185,129,0.45); }
        .toast.success svg { color: var(--state-success); flex-shrink: 0; }
        .toast.error { border-color: rgba(244,63,94,0.45); }
        .toast.error svg { color: var(--state-error); flex-shrink: 0; }
      `}</style>
    </div>
  );
}

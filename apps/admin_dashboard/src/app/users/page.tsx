"use client";

import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Phone, 
  Mail, 
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Check,
  User,
  Users
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import UserProfileBadge from "@/components/UserProfileBadge";

interface DBAdmin {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  admin_role: "Super Admin" | "Operations Admin" | "Bursar" | "Dispatcher" | "Fleet Manager" | "Roster Manager";
  national_id?: string;
  status?: string;
}

const PERMISSION_MATRIX = [
  {
    role: "Super Admin",
    color: "var(--accent-secondary)",
    permissions: {
      dashboard: "Full Access",
      fleet: "Manage All",
      roster: "Manage All",
      billing: "Manage All",
      admins: "Yes (Onboard/Delete)"
    }
  },
  {
    role: "Operations Admin",
    color: "#ec4899",
    permissions: {
      dashboard: "Full Console (Ops)",
      fleet: "Manage All",
      roster: "Manage All",
      billing: "Manage All",
      admins: "No"
    }
  },
  {
    role: "Bursar",
    color: "#14b8a6",
    permissions: {
      dashboard: "Billing Console",
      fleet: "View Only",
      roster: "View Only",
      billing: "Manage Billing & Plans",
      admins: "No"
    }
  },
  {
    role: "Dispatcher",
    color: "#6366f1",
    permissions: {
      dashboard: "Live Operations & Telemetry",
      fleet: "View Only",
      roster: "View Only",
      billing: "View Only",
      admins: "No"
    }
  },
  {
    role: "Fleet Manager",
    color: "var(--accent-primary)",
    permissions: {
      dashboard: "Fleet & Staff Consoles",
      fleet: "Manage Vehicles/Staff/Maintenance",
      roster: "View Only",
      billing: "No",
      admins: "No"
    }
  },
  {
    role: "Roster Manager",
    color: "#eab308",
    permissions: {
      dashboard: "Roster & Route Planning",
      fleet: "View Only",
      roster: "Manage Students/Parents/Routes",
      billing: "No",
      admins: "No"
    }
  }
];

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

export default function UserAndRoleManagement() {
  const [admins, setAdmins] = useState<DBAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  const { profile } = useAuth();
  const router = useRouter();

  // Redirect users who are not Super Admin
  useEffect(() => {
    if (profile && profile.admin_role !== "Super Admin") {
      router.push("/");
    }
  }, [profile, router]);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  // Drawer Modal State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);

  // Form State
  const [formValues, setFormValues] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    admin_role: "Super Admin" as "Super Admin" | "Operations Admin" | "Bursar" | "Dispatcher" | "Fleet Manager" | "Roster Manager",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (json.success) {
        setAdmins(json.data);
      }
    } catch (err) {
      console.error("Failed to load administrator accounts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "Full name is required";
    
    const phoneTrimmed = formValues.phone.trim();
    if (!phoneTrimmed) {
      errors.phone = "Phone number is required";
    } else {
      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
      let matchedCode = "";
      for (const code of codes) {
        if (phoneTrimmed.startsWith(code)) {
          matchedCode = code;
          break;
        }
      }
      const localPart = matchedCode ? phoneTrimmed.substring(matchedCode.length) : phoneTrimmed;
      if (!localPart) {
        errors.phone = "Phone number details are required";
      } else if (!/^\d+$/.test(localPart)) {
        errors.phone = "Phone number must consist of digits only";
      } else if (localPart.length < 7 || localPart.length > 11) {
        errors.phone = "Enter a valid phone number (7-11 digits)";
      }
    }

    if (!formValues.email.trim()) {
      errors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
      errors.email = "Enter a valid email address";
    }
    if (drawerMode === "add") {
      if (!formValues.password) {
        errors.password = "Password is required";
      } else if (formValues.password.length < 6) {
        errors.password = "Password must be at least 6 characters";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitLoading(true);

    try {
      if (drawerMode === "add") {
        if (!isSupabaseConfigured) {
          // --- Sandbox Bypass Mode ---
          const res = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formValues.name,
              phone: formValues.phone,
              email: formValues.email,
              admin_role: formValues.admin_role
            })
          });
          const json = await res.json();
          if (json.success) {
            await fetchAdmins();
            setShowDrawer(false);
            alert("New Administrator account registered successfully (Sandbox Mode)!");
          } else {
            alert(`Registration failed: ${json.error || "Unknown validation error"}`);
          }
        } else {
          // --- Real Supabase Mode ---
          const { createClient } = await import("@supabase/supabase-js");
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
          const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
          
          const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false }
          });

          // Create auth account (trigger will auto-insert profile)
          const { data: authData, error: authError } = await tempClient.auth.signUp({
            email: formValues.email,
            password: formValues.password,
            options: {
              data: {
                name: formValues.name,
                phone: formValues.phone,
                role: "school_admin",
                admin_role: formValues.admin_role,
                tenant_id: "8c9ad841-f762-4217-a021-9876251b5bcf"
              }
            }
          });

          if (authError) {
            alert(`Authentication registration failed: ${authError.message}`);
          } else {
            await fetchAdmins();
            setShowDrawer(false);
            alert("New Administrator registered successfully! Auth account created in Supabase.");
          }
        }
      } else {
        const res = await fetch(`/api/users/${currentEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();
        if (json.success) {
          await fetchAdmins();
          setShowDrawer(false);
          alert("Administrator details modified successfully.");
        } else {
          alert("Failed to update profile.");
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this administrator's dashboard access?")) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        await fetchAdmins();
        alert("Administrator access revoked.");
      } else {
        alert("Failed to delete user profile.");
      }
    } catch (err) {
      console.error("Delete operation failed:", err);
    }
  };

  // Metrics
  const totalAdmins = admins.length;
  const superAdminsCount = admins.filter(a => a.admin_role === "Super Admin").length;
  const dispatchersCount = admins.filter(a => a.admin_role === "Dispatcher").length;
  const managersCount = admins.filter(a => a.admin_role === "Fleet Manager" || a.admin_role === "Roster Manager").length;

  // Filtered List
  const filteredAdmins = admins.filter(admin => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = 
      admin.name.toLowerCase().includes(query) ||
      admin.email.toLowerCase().includes(query) ||
      admin.phone.includes(query);

    if (roleFilter !== "All" && admin.admin_role !== roleFilter) return false;
    return matchesQuery;
  });

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .admin-card {
          background: rgba(12, 17, 34, 0.7);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 20px;
          position: relative;
          transition: all 0.2s ease;
        }
        .admin-card:hover {
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }
        .admin-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          border-radius: 12px 0 0 12px;
        }
        .admin-card.Super-Admin::before { background: var(--accent-secondary); }
        .admin-card.Operations-Admin::before { background: #ec4899; }
        .admin-card.Bursar::before { background: #14b8a6; }
        .admin-card.Dispatcher::before { background: #6366f1; }
        .admin-card.Fleet-Manager::before { background: var(--accent-primary); }
        .admin-card.Roster-Manager::before { background: #eab308; }

        .admin-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1.1rem;
        }
        .admin-avatar.Super-Admin { background: rgba(99, 102, 241, 0.1); color: var(--accent-secondary); }
        .admin-avatar.Operations-Admin { background: rgba(236, 72, 153, 0.1); color: #ec4899; }
        .admin-avatar.Bursar { background: rgba(20, 184, 166, 0.1); color: #14b8a6; }
        .admin-avatar.Dispatcher { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
        .admin-avatar.Fleet-Manager { background: rgba(16, 185, 129, 0.1); color: var(--accent-primary); }
        .admin-avatar.Roster-Manager { background: rgba(234, 179, 8, 0.1); color: #eab308; }

        .role-badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          text-transform: uppercase;
        }
        .role-badge.Super-Admin { background: rgba(99, 102, 241, 0.15); color: var(--accent-secondary); border: 1px solid rgba(99, 102, 241, 0.3); }
        .role-badge.Operations-Admin { background: rgba(236, 72, 153, 0.15); color: #ec4899; border: 1px solid rgba(236, 72, 153, 0.3); }
        .role-badge.Bursar { background: rgba(20, 184, 166, 0.15); color: #14b8a6; border: 1px solid rgba(20, 184, 166, 0.3); }
        .role-badge.Dispatcher { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
        .role-badge.Fleet-Manager { background: rgba(16, 185, 129, 0.15); color: var(--accent-primary); border: 1px solid rgba(16, 185, 129, 0.3); }
        .role-badge.Roster-Manager { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }

        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(4, 6, 12, 0.85);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          justify-content: flex-end;
        }
        .drawer-content {
          width: 450px;
          height: 100%;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-default);
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          box-shadow: -10px 0 25px rgba(0, 0, 0, 0.5);
          animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .form-group {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .form-input {
          background: rgba(6, 9, 19, 0.6);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
        }
        .form-error-text {
          font-size: 0.75rem;
          color: var(--state-error);
        }
        .matrix-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
          margin-top: 12px;
        }
        .matrix-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-default);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.75rem;
        }
        .matrix-table td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          vertical-align: middle;
        }

        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .spinner-icon {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.25);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Administrator Roster Console</span>
            <span style={{ 
              marginLeft: "12px", 
              background: "rgba(99,102,241,0.1)", 
              color: "var(--accent-secondary)", 
              padding: "3px 8px", 
              borderRadius: "4px", 
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid rgba(99,102,241,0.2)"
            }}>
              Role & Account Management
            </span>
          </div>
          <UserProfileBadge />
        </header>

        {/* Dashboard KPI Row */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Total Administrators</div>
            <div className="stat-value">{totalAdmins}</div>
            <div className="stat-desc">Active dashboard accounts</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Super Administrators</div>
            <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
              {superAdminsCount}
            </div>
            <div className="stat-desc">Full dashboard coordinators</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Dispatchers</div>
            <div className="stat-value" style={{ color: "#6366f1" }}>
              {dispatchersCount}
            </div>
            <div className="stat-desc">Live logistics monitors</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Managers (Fleet & Roster)</div>
            <div className="stat-value" style={{ color: "var(--accent-primary)" }}>
              {managersCount}
            </div>
            <div className="stat-desc">Silo coordinators</div>
          </div>
        </section>

        {/* Main Content Layout */}
        <section className="dashboard-content-layout" style={{ gridTemplateColumns: "1fr 380px" }}>
          
          {/* Admins List View */}
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="panel-title" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                  <ShieldCheck size={20} style={{ color: "var(--accent-primary)" }} />
                  Registered System Administrators
                </span>
              </div>
              <button 
                onClick={() => {
                  setDrawerMode("add");
                  setCurrentEditId(null);
                  setFormValues({ name: "", phone: "", email: "", password: "", admin_role: "Super Admin" });
                  setFormErrors({});
                  setShowDrawer(true);
                }}
                style={{
                  background: "linear-gradient(135deg, var(--accent-secondary), #3b82f6)",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Plus size={16} />
                Register Dashboard Admin
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: "100%", paddingLeft: "36px" }}
                  placeholder="Search administrators by name, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
                  🔍
                </span>
              </div>
              <select
                className="form-input"
                style={{ width: "200px" }}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="All">All Roles</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Operations Admin">Operations Admin</option>
                <option value="Bursar">Bursar</option>
                <option value="Dispatcher">Dispatcher</option>
                <option value="Fleet Manager">Fleet Manager</option>
                <option value="Roster Manager">Roster Manager</option>
              </select>
            </div>

            {/* Administrators Grid */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", color: "var(--text-muted)" }}>
                <span>Loading administrator directory...</span>
              </div>
            ) : filteredAdmins.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <span>No administrators found matching criteria.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
                {filteredAdmins.map(admin => {
                  const roleClass = admin.admin_role.replace(" ", "-");
                  const initials = admin.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

                  return (
                    <div key={admin.id} className={`admin-card ${roleClass}`}>
                      
                      {/* Top section: Avatar and Actions */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <div className={`admin-avatar ${roleClass}`}>{initials}</div>
                          <div>
                            <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>{admin.name}</h3>
                            <div style={{ marginTop: "4px" }}>
                              <span className={`role-badge ${roleClass}`}>
                                {admin.admin_role}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => {
                              setDrawerMode("edit");
                              setCurrentEditId(admin.id);
                              setFormValues({ 
                                name: admin.name, 
                                phone: admin.phone, 
                                email: admin.email,
                                password: "",
                                admin_role: admin.admin_role
                              });
                              setShowDrawer(true);
                            }}
                            style={{ background: "rgba(255,255,255,0.03)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--text-muted)" }}
                            title="Edit Profile"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            disabled={admin.email === "sarah.jenkins@school.com"} // Lock main admin
                            onClick={() => handleDeleteAdmin(admin.id)}
                            style={{ 
                              background: admin.email === "sarah.jenkins@school.com" ? "rgba(255,255,255,0.01)" : "rgba(244,63,94,0.05)", 
                              border: "none", 
                              borderRadius: "6px", 
                              padding: "6px", 
                              cursor: admin.email === "sarah.jenkins@school.com" ? "default" : "pointer", 
                              color: admin.email === "sarah.jenkins@school.com" ? "rgba(255,255,255,0.1)" : "var(--state-error)" 
                            }}
                            title={admin.email === "sarah.jenkins@school.com" ? "Main Admin Account Locked" : "Revoke Access"}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Contact Fields */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Phone size={12} style={{ color: "var(--accent-primary)" }} />
                          <span>{admin.phone}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Mail size={12} style={{ color: "var(--accent-secondary)" }} />
                          <span>{admin.email}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Role & Permission Reference Matrix */}
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <span className="panel-title" style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Sliders size={18} style={{ color: "var(--accent-secondary)" }} />
                Admin Permissions Matrix
              </span>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px" }}>
                Reference guide detailing authorization access constraints for dashboard users.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {PERMISSION_MATRIX.map((pm, i) => (
                <div key={i} style={{ 
                  background: "rgba(255,255,255,0.01)", 
                  border: `1px solid rgba(255,255,255,0.03)`,
                  borderLeft: `3px solid ${pm.color}`,
                  borderRadius: "8px", 
                  padding: "12px"
                }}>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: 600, color: pm.color, marginBottom: "8px" }}>
                    {pm.role}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>System Console:</span>
                      <span style={{ fontWeight: 500 }}>{pm.permissions.dashboard}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Fleet Operations:</span>
                      <span style={{ fontWeight: 500 }}>{pm.permissions.fleet}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Roster & Routes:</span>
                      <span style={{ fontWeight: 500 }}>{pm.permissions.roster}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-muted)" }}>Admin Management:</span>
                      <span style={{ fontWeight: 500, color: pm.permissions.admins === "No" ? "var(--state-error)" : "var(--state-success)" }}>
                        {pm.permissions.admins}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Slide-out Add/Edit Drawer Dialog */}
      {showDrawer && (
        <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={18} style={{ color: "var(--accent-secondary)" }} />
                {drawerMode === "add" ? "Register Dashboard Admin" : "Modify Administrator Details"}
              </h2>
              <button onClick={() => setShowDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className={`form-input ${formErrors.name ? "error" : ""}`}
                  placeholder="e.g. Robert Kiprop"
                  value={formValues.name}
                  onChange={handleInputChange}
                />
                {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  className={`form-input ${formErrors.email ? "error" : ""}`}
                  placeholder="e.g. robert.kiprop@school.com"
                  value={formValues.email}
                  onChange={handleInputChange}
                />
                {formErrors.email && <span className="form-error-text">{formErrors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={(() => {
                      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                      for (const code of codes) {
                        if (formValues.phone.startsWith(code)) return code;
                      }
                      return "+254";
                    })()}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                      let currentLocal = formValues.phone;
                      for (const code of codes) {
                        if (formValues.phone.startsWith(code)) {
                          currentLocal = formValues.phone.substring(code.length);
                          break;
                        }
                      }
                      if (currentLocal.startsWith("0")) currentLocal = currentLocal.substring(1);
                      setFormValues(prev => ({ ...prev, phone: newCode + currentLocal }));
                      if (formErrors.phone) {
                        setFormErrors(prev => ({ ...prev, phone: "" }));
                      }
                    }}
                    className="form-input"
                    style={{ width: "95px", paddingLeft: "8px", paddingRight: "8px" }}
                  >
                    <option value="+254">🇰🇪 +254</option>
                    <option value="+256">🇺🇬 +256</option>
                    <option value="+255">🇹🇿 +255</option>
                    <option value="+250">🇷🇼 +250</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>
                  <input
                    type="text"
                    required
                    className={`form-input ${formErrors.phone ? "error" : ""}`}
                    style={{ flex: 1 }}
                    placeholder="e.g. 700 333 444"
                    value={(() => {
                      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                      for (const code of codes) {
                        if (formValues.phone.startsWith(code)) {
                          return formValues.phone.substring(code.length);
                        }
                      }
                      return formValues.phone;
                    })()}
                    onChange={(e) => {
                      const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                      let currentCode = "+254";
                      for (const code of codes) {
                        if (formValues.phone.startsWith(code)) {
                          currentCode = code;
                          break;
                        }
                      }
                      let val = e.target.value.replace(/[\s\-()]+/g, "");
                      if (val.startsWith("0")) val = val.substring(1);
                      setFormValues(prev => ({ ...prev, phone: currentCode + val }));
                      if (formErrors.phone) {
                        setFormErrors(prev => ({ ...prev, phone: "" }));
                      }
                    }}
                  />
                </div>
                {formErrors.phone && <span className="form-error-text">{formErrors.phone}</span>}
              </div>

              {drawerMode === "add" && (
                <div className="form-group">
                  <label className="form-label">Account Password *</label>
                  <input
                    type="password"
                    name="password"
                    required
                    className={`form-input ${formErrors.password ? "error" : ""}`}
                    placeholder="Min. 6 characters"
                    value={formValues.password}
                    onChange={handleInputChange}
                  />
                  {formErrors.password && <span className="form-error-text">{formErrors.password}</span>}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Dashboard Role *</label>
                <select
                  name="admin_role"
                  className="form-input"
                  value={formValues.admin_role}
                  onChange={handleInputChange}
                >
                  <option value="Super Admin">Super Admin (Full Console Access)</option>
                  <option value="Operations Admin">Operations Admin (Manage Ops/Billing, No Admins)</option>
                  <option value="Bursar">Bursar (Billing Manage, View-only Ops)</option>
                  <option value="Dispatcher">Dispatcher (Live Ops & Telemetry)</option>
                  <option value="Fleet Manager">Fleet Manager (Vehicles & Maintenance)</option>
                  <option value="Roster Manager">Roster Manager (Students & Routes)</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px", marginTop: "auto", paddingTop: "20px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowDrawer(false)}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-muted)",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitLoading}
                  style={{
                    flex: 2,
                    background: "var(--accent-secondary)",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: isSubmitLoading ? "default" : "pointer"
                  }}
                >
                  {isSubmitLoading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <span className="spinner-icon"></span>
                      Saving...
                    </span>
                  ) : drawerMode === "add" ? "Register Admin" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

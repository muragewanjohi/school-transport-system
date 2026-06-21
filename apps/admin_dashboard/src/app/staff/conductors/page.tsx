"use client";

import React, { useState, useEffect } from "react";
import { 
  User, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Phone, 
  Mail, 
  Bus, 
  Sparkles,
  UserCheck,
  ShieldAlert
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface DBProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  national_id: string;
  status: "Available" | "Unavailable";
}

interface DBVehicle {
  id: string;
  license_plate: string;
  model: string;
  conductor_1_id: string | null;
  conductor_2_id: string | null;
}

export default function ConductorsManagement() {
  const [conductors, setConductors] = useState<DBProfile[]>([]);
  const [vehicles, setVehicles] = useState<DBVehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Modal State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  
  // Form State
  const [formValues, setFormValues] = useState({
    name: "",
    phone: "",
    email: "",
    national_id: "",
    status: "Available" as "Available" | "Unavailable",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch conductors
        const conductorsRes = await fetch("/api/conductors");
        const conductorsJson = await conductorsRes.json();
        if (conductorsJson.success) {
          const localConductors = localStorage.getItem("safaricom_conductors_sandbox");
          if (localConductors) {
            setConductors(JSON.parse(localConductors));
          } else {
            setConductors(conductorsJson.data);
            localStorage.setItem("safaricom_conductors_sandbox", JSON.stringify(conductorsJson.data));
          }
        }

        // Fetch vehicles (for assignment slots)
        const fleetRes = await fetch("/api/fleet");
        const fleetJson = await fleetRes.json();
        if (fleetJson.success) {
          const localVehicles = localStorage.getItem("safaricom_fleet_sandbox");
          if (localVehicles) {
            setVehicles(JSON.parse(localVehicles));
          } else {
            setVehicles(fleetJson.data);
          }
        }
      } catch (err) {
        console.error("Failed to load conductors page data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const saveConductorsState = (updatedConductors: DBProfile[]) => {
    setConductors(updatedConductors);
    localStorage.setItem("safaricom_conductors_sandbox", JSON.stringify(updatedConductors));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "Conductor name is required";
    if (!formValues.phone.trim()) errors.phone = "Phone number is required";
    if (!formValues.national_id.trim()) {
      errors.national_id = "National ID number is required";
    } else if (formValues.national_id.trim().length < 4) {
      errors.national_id = "National ID must be at least 4 digits";
    }
    if (!formValues.email.trim()) {
      errors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
      errors.email = "Enter a valid email address";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Assign Conductor to Bus (Allocating Conductor 1 or Conductor 2 slot)
  const handleAssignBus = async (conductorId: string, vehicleId: string) => {
    try {
      let updatedVehicles = [...vehicles];

      // 1. Unassign conductor from their current vehicle (if they are assigned anywhere)
      for (const vehicle of updatedVehicles) {
        if (vehicle.conductor_1_id === conductorId) {
          vehicle.conductor_1_id = null;
          await fetch(`/api/fleet/${vehicle.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conductor_1_id: null })
          });
        } else if (vehicle.conductor_2_id === conductorId) {
          vehicle.conductor_2_id = null;
          await fetch(`/api/fleet/${vehicle.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conductor_2_id: null })
          });
        }
      }

      // 2. If assigning to a bus (not unassigned)
      if (vehicleId) {
        const targetVehicle = updatedVehicles.find(v => v.id === vehicleId);
        
        if (targetVehicle) {
          // Determine slot allocation
          if (targetVehicle.conductor_1_id === null) {
            targetVehicle.conductor_1_id = conductorId;
            await fetch(`/api/fleet/${vehicleId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conductor_1_id: conductorId })
            });
          } else if (targetVehicle.conductor_2_id === null) {
            targetVehicle.conductor_2_id = conductorId;
            await fetch(`/api/fleet/${vehicleId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conductor_2_id: conductorId })
            });
          } else {
            alert(`Bus is fully allocated! Both conductor slots for ${targetVehicle.license_plate} are already occupied. Please unassign one before assigning this conductor.`);
            return;
          }
        }
      }

      // Save to local storage for vehicles
      setVehicles(updatedVehicles);
      localStorage.setItem("safaricom_fleet_sandbox", JSON.stringify(updatedVehicles));
      alert("Conductor vehicle allocation slot successfully updated!");

    } catch (err) {
      console.error("Failed to update conductor assignment:", err);
    }
  };

  // Toggle Conductor Status directly on card
  const handleToggleStatus = (conductorId: string) => {
    const updated = conductors.map(c => {
      if (c.id === conductorId) {
        const newStatus = c.status === "Available" ? "Unavailable" : "Available";
        return { ...c, status: newStatus as "Available" | "Unavailable" };
      }
      return c;
    });
    saveConductorsState(updated);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitLoading(true);

    try {
      if (drawerMode === "add") {
        const res = await fetch("/api/conductors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();
        if (json.success) {
          const newConductor: DBProfile = {
            ...formValues,
            id: json.data.id || `cnd-${Date.now()}`
          };
          saveConductorsState([...conductors, newConductor]);
          setShowDrawer(false);
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to register conductor: ${errorMsg}`);
        }
      } else {
        const updated = conductors.map(c => 
          c.id === currentEditId 
            ? { ...c, ...formValues } 
            : c
        );
        saveConductorsState(updated);
        setShowDrawer(false);
        alert("Conductor profile updated.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteConductor = (id: string) => {
    if (!confirm("Are you sure you want to remove this conductor profile? This will also unassign them from any active bus slots.")) return;
    
    // Unassign conductor from any vehicle slots
    const updatedVehicles = vehicles.map(v => {
      let changed = false;
      let c1 = v.conductor_1_id;
      let c2 = v.conductor_2_id;
      if (c1 === id) { c1 = null; changed = true; }
      if (c2 === id) { c2 = null; changed = true; }
      return changed ? { ...v, conductor_1_id: c1, conductor_2_id: c2 } : v;
    });
    setVehicles(updatedVehicles);
    localStorage.setItem("safaricom_fleet_sandbox", JSON.stringify(updatedVehicles));

    const filtered = conductors.filter(c => c.id !== id);
    saveConductorsState(filtered);
  };

  // Metrics
  const totalConductors = conductors.length;
  const assignedConductorIds = new Set(
    vehicles.flatMap(v => [v.conductor_1_id, v.conductor_2_id]).filter(Boolean)
  );
  const assignedConductorsCount = conductors.filter(c => assignedConductorIds.has(c.id)).length;
  const availableConductorsCount = conductors.filter(c => c.status === "Available").length;

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .conductor-card {
          background: rgba(12, 17, 34, 0.7);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 16px;
          position: relative;
          transition: all 0.2s ease;
        }
        .conductor-card:hover {
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }
        .conductor-avatar {
          width: 44px;
          height: 44px;
          background: rgba(99, 102, 241, 0.1);
          color: var(--accent-secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1.1rem;
        }
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
        .badge-availability {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          cursor: pointer;
        }
        .badge-availability.Available {
          background: rgba(16, 185, 129, 0.15);
          color: var(--state-success);
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .badge-availability.Unavailable {
          background: rgba(244, 63, 94, 0.15);
          color: var(--state-error);
          border: 1px solid rgba(244, 63, 94, 0.3);
        }
        .switch-container {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          margin-top: 4px;
        }
        .switch-track {
          width: 36px;
          height: 20px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-default);
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .switch-track.Available {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
        }
        .switch-track.Unavailable {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.4);
        }
        .switch-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .switch-track.Available .switch-thumb {
          transform: translateX(16px);
          background: var(--state-success);
        }
        .switch-track.Unavailable .switch-thumb {
          transform: translateX(0);
          background: var(--text-muted);
        }
        .switch-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .switch-label.Available {
          color: var(--state-success);
        }
        .switch-label.Unavailable {
          color: var(--state-error);
        }
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner-icon {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.25);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Conductors Roster Directory</span>
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
              Staff Management
            </span>
          </div>
          <div className="user-profile">
            <div className="profile-avatar">SA</div>
            <div>
              <span className="profile-name">Sarah Jenkins</span>
              <span className="profile-role">School Admin</span>
            </div>
          </div>
        </header>

        {/* Conductors KPI Metrics Row */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Total Conductors</div>
            <div className="stat-value">{totalConductors}</div>
            <div className="stat-desc">Registered conductors staff</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Available Active</div>
            <div className="stat-value" style={{ color: "var(--state-success)" }}>
              {availableConductorsCount} / {totalConductors}
            </div>
            <div className="stat-desc">Conductors ready for schedules</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Assigned to Buses</div>
            <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
              {assignedConductorsCount}
            </div>
            <div className="stat-desc">Active route allocation slots</div>
          </div>
        </section>

        {/* Main Panel Content */}
        <section className="dashboard-content-layout" style={{ gridTemplateColumns: "1fr" }}>
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="panel-title" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                  <UserCheck size={20} style={{ color: "var(--accent-secondary)" }} />
                  Staff Conductors manifests
                </span>
              </div>
              <button 
                onClick={() => {
                  setDrawerMode("add");
                  setCurrentEditId(null);
                  setFormValues({ name: "", phone: "", email: "", national_id: "", status: "Available" });
                  setFormErrors({});
                  setShowDrawer(true);
                }}
                style={{
                  background: "linear-gradient(135deg, var(--accent-secondary), #4f46e5)",
                  color: "#ffffff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.2)"
                }}
              >
                <Plus size={16} />
                Register New Conductor
              </button>
            </div>

            {/* Grid */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", color: "var(--text-muted)" }}>
                <span>Loading conductors catalog...</span>
              </div>
            ) : conductors.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <span>No conductors profiles registered yet.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "16px" }}>
                {conductors.map(conductor => {
                  const assignedVehicle = vehicles.find(v => v.conductor_1_id === conductor.id || v.conductor_2_id === conductor.id);
                  const slotLabel = assignedVehicle?.conductor_1_id === conductor.id ? "Slot 1" : "Slot 2";
                  const initials = conductor.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

                  return (
                    <div key={conductor.id} className="conductor-card">
                      
                      {/* Top profile view */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <div className="conductor-avatar">{initials}</div>
                          <div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{conductor.name}</h3>
                            <div className="switch-container" onClick={() => handleToggleStatus(conductor.id)}>
                              <div className={`switch-track ${conductor.status}`} title="Click to toggle availability status">
                                <div className="switch-thumb" />
                              </div>
                              <span className={`switch-label ${conductor.status}`}>
                                {conductor.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => {
                              setDrawerMode("edit");
                              setCurrentEditId(conductor.id);
                              setFormValues({ 
                                name: conductor.name, 
                                phone: conductor.phone, 
                                email: conductor.email,
                                national_id: conductor.national_id || "",
                                status: conductor.status || "Available"
                              });
                              setShowDrawer(true);
                            }}
                            style={{ background: "rgba(255,255,255,0.03)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--text-muted)" }}
                            title="Edit Conductor Profile"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteConductor(conductor.id)}
                            style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                            title="Remove Profile"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Contacts & ID */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Phone size={12} style={{ color: "var(--accent-primary)" }} />
                          <span>{conductor.phone}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Mail size={12} style={{ color: "var(--accent-secondary)" }} />
                          <span>{conductor.email}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <ShieldAlert size={12} style={{ color: "var(--state-warning)" }} />
                          <span>National ID: <strong style={{ color: "var(--text-primary)" }}>{conductor.national_id || "N/A"}</strong></span>
                        </div>
                      </div>

                      {/* Bus Assignment Section */}
                      <div style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "12px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label className="form-label" style={{ fontSize: "0.65rem", display: "flex", alignItems: "center", gap: "4px", margin: 0 }}>
                            <Bus size={10} /> Allocated Bus Assignment
                          </label>
                          {assignedVehicle && (
                            <span style={{ fontSize: "0.65rem", background: "rgba(99,102,241,0.15)", color: "var(--accent-secondary)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                              {slotLabel}
                            </span>
                          )}
                        </div>
                        <select
                          className="form-input"
                          style={{ width: "100%", padding: "6px 8px", fontSize: "0.8rem" }}
                          value={assignedVehicle?.id || ""}
                          onChange={(e) => handleAssignBus(conductor.id, e.target.value)}
                          disabled={conductor.status === "Unavailable"}
                          title={conductor.status === "Unavailable" ? "Cannot assign unavailable conductor to a bus" : ""}
                        >
                          <option value="">Standby (Unallocated / Standby)</option>
                          {vehicles.map(vehicle => {
                            const bothSlotsFull = vehicle.conductor_1_id !== null && 
                                                  vehicle.conductor_2_id !== null &&
                                                  vehicle.conductor_1_id !== conductor.id &&
                                                  vehicle.conductor_2_id !== conductor.id;
                            return (
                              <option 
                                key={vehicle.id} 
                                value={vehicle.id}
                                disabled={bothSlotsFull}
                              >
                                {vehicle.license_plate} - {vehicle.model} {bothSlotsFull ? " (Slots Full)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Drawer Dialog */}
      {showDrawer && (
        <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={18} style={{ color: "var(--accent-secondary)" }} />
                {drawerMode === "add" ? "Register Roster Conductor" : "Modify Profile Details"}
              </h2>
              <button onClick={() => setShowDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className={`form-input ${formErrors.name ? "error" : ""}`}
                  placeholder="e.g. Jane Wanjiku"
                  value={formValues.name}
                  onChange={handleInputChange}
                />
                {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">National ID Number *</label>
                <input
                  type="text"
                  name="national_id"
                  required
                  className={`form-input ${formErrors.national_id ? "error" : ""}`}
                  placeholder="e.g. 29402941"
                  value={formValues.national_id}
                  onChange={handleInputChange}
                />
                {formErrors.national_id && <span className="form-error-text">{formErrors.national_id}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input
                  type="text"
                  name="phone"
                  required
                  className={`form-input ${formErrors.phone ? "error" : ""}`}
                  placeholder="e.g. +254 755 123 456"
                  value={formValues.phone}
                  onChange={handleInputChange}
                />
                {formErrors.phone && <span className="form-error-text">{formErrors.phone}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  className={`form-input ${formErrors.email ? "error" : ""}`}
                  placeholder="e.g. jane.wanjiku@school.com"
                  value={formValues.email}
                  onChange={handleInputChange}
                />
                {formErrors.email && <span className="form-error-text">{formErrors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Availability Status</label>
                <select
                  name="status"
                  className="form-input"
                  value={formValues.status}
                  onChange={handleInputChange}
                >
                  <option value="Available">Available (Duty Standby)</option>
                  <option value="Unavailable">Unavailable (Off Duty / Sick)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "auto", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
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
                  ) : drawerMode === "add" ? "Register Conductor" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

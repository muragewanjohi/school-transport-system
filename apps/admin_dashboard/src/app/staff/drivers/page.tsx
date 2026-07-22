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
  ShieldAlert,
  Camera,
  Upload
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";

interface DBProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  national_id: string;
  status: "Available" | "Unavailable";
  avatar_url?: string | null;
}

interface DBVehicle {
  id: string;
  license_plate: string;
  model: string;
  active_driver_id: string | null;
}

export default function DriversManagement() {
  const [drivers, setDrivers] = useState<DBProfile[]>([]);
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
    avatar_url: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "avatars");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (json.success && json.url) {
        setFormValues(prev => ({ ...prev, avatar_url: json.url }));
      } else {
        alert(json.error || "Failed to upload photo");
      }
    } catch (err) {
      console.error("Photo upload error:", err);
      alert("Error uploading photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await fetch("/api/drivers");
      const json = await res.json();
      if (json.success) {
        setDrivers(json.data);
      }
    } catch (err) {
      console.error("Failed to load drivers:", err);
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await fetch("/api/fleet");
      const json = await res.json();
      if (json.success) {
        setVehicles(json.data);
      }
    } catch (err) {
      console.error("Failed to load vehicles:", err);
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    await Promise.all([fetchDrivers(), fetchVehicles()]);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInitialData();
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
    if (!formValues.name.trim()) errors.name = "Driver name is required";
    
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

  // Assign Driver to Bus
  const handleAssignBus = async (driverId: string, vehicleId: string) => {
    try {
      // 1. Find the vehicle currently assigned to this driver and set it to null
      const previousVehicle = vehicles.find(v => v.active_driver_id === driverId);
      
      if (previousVehicle) {
        await fetch(`/api/fleet/${previousVehicle.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_driver_id: null })
        });
      }

      // 2. If assigning to a new vehicle
      if (vehicleId) {
        await fetch(`/api/fleet/${vehicleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_driver_id: driverId })
        });
      }

      await fetchInitialData();
      alert("Driver vehicle assignment updated successfully!");

    } catch (err) {
      console.error("Failed to update driver assignment:", err);
    }
  };

  // Toggle Driver Status directly on card
  const handleToggleStatus = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    const newStatus = driver.status === "Available" ? "Unavailable" : "Available";
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const json = await res.json();
      if (json.success) {
        await fetchDrivers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitLoading(true);

    try {
      if (drawerMode === "add") {
        const res = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();
        if (json.success) {
          await fetchDrivers();
          setShowDrawer(false);
          const otpMessage = json.sandbox_otp ? `\n\n[SANDBOX OTP FOR MOBILE LOGIN]: ${json.sandbox_otp}` : "";
          alert(`Driver registered successfully! An OTP has been dispatched to their phone.${otpMessage}`);
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to register driver: ${errorMsg}`);
        }
      } else {
        const res = await fetch(`/api/drivers/${currentEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();
        if (json.success) {
          await fetchDrivers();
          setShowDrawer(false);
          alert("Driver profile updated.");
        } else {
          alert(`Failed to update profile: ${json.error || "Unknown error"}`);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!confirm("Are you sure you want to remove this driver profile? This will also unassign them from any active bus.")) return;
    
    try {
      const res = await fetch(`/api/drivers/${id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        await fetchInitialData();
        alert("Driver profile removed successfully.");
      } else {
        alert(`Failed to delete: ${json.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Metrics
  const totalDrivers = drivers.length;
  const assignedDriverIds = new Set(vehicles.map(v => v.active_driver_id).filter(Boolean));
  const assignedDriversCount = drivers.filter(d => assignedDriverIds.has(d.id)).length;
  const availableDriversCount = drivers.filter(d => d.status === "Available").length;

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .driver-card {
          background: rgba(12, 17, 34, 0.7);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 16px;
          position: relative;
          transition: all 0.2s ease;
        }
        .driver-card:hover {
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }
        .driver-avatar {
          width: 44px;
          height: 44px;
          background: rgba(16, 185, 129, 0.1);
          color: var(--accent-primary);
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
            <span className="top-bar-title">Drivers Roster Directory</span>
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
          <UserProfileBadge />
        </header>

        {/* Drivers KPI Metrics Row */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Total Drivers</div>
            <div className="stat-value">{totalDrivers}</div>
            <div className="stat-desc">Registered driving staff</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Available Active</div>
            <div className="stat-value" style={{ color: "var(--state-success)" }}>
              {availableDriversCount} / {totalDrivers}
            </div>
            <div className="stat-desc">Drivers ready for schedules</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Assigned to Buses</div>
            <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
              {assignedDriversCount}
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
                  <UserCheck size={20} style={{ color: "var(--accent-primary)" }} />
                  Staff Drivers manifests
                </span>
              </div>
              <button 
                onClick={() => {
                  setDrawerMode("add");
                  setCurrentEditId(null);
                  setFormValues({ name: "", phone: "", email: "", national_id: "", status: "Available", avatar_url: "" });
                  setFormErrors({});
                  setShowDrawer(true);
                }}
                style={{
                  background: "linear-gradient(135deg, var(--accent-primary), #059669)",
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
                Register New Driver
              </button>
            </div>

            {/* Grid */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px", color: "var(--text-muted)" }}>
                <span>Loading drivers catalog...</span>
              </div>
            ) : drivers.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <span>No drivers profiles registered yet.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "16px" }}>
                {drivers.map(driver => {
                  const assignedVehicle = vehicles.find(v => v.active_driver_id === driver.id);
                  const initials = driver.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

                  return (
                    <div key={driver.id} className="driver-card">
                      
                      {/* Top profile view */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          {driver.avatar_url ? (
                            <img 
                              src={driver.avatar_url} 
                              alt={driver.name} 
                              className="driver-avatar"
                              style={{ objectFit: "cover", width: "42px", height: "42px", borderRadius: "50%" }}
                            />
                          ) : (
                            <div className="driver-avatar">{initials}</div>
                          )}
                          <div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>{driver.name}</h3>
                            <div className="switch-container" onClick={() => handleToggleStatus(driver.id)}>
                              <div className={`switch-track ${driver.status}`} title="Click to toggle availability status">
                                <div className="switch-thumb" />
                              </div>
                              <span className={`switch-label ${driver.status}`}>
                                {driver.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => {
                              setDrawerMode("edit");
                              setCurrentEditId(driver.id);
                              setFormValues({ 
                                name: driver.name, 
                                phone: driver.phone, 
                                email: driver.email,
                                national_id: driver.national_id || "",
                                status: driver.status || "Available",
                                avatar_url: driver.avatar_url || ""
                              });
                              setShowDrawer(true);
                            }}
                            style={{ background: "rgba(255,255,255,0.03)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--text-muted)" }}
                            title="Edit Driver Profile"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteDriver(driver.id)}
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
                          <span>{driver.phone}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Mail size={12} style={{ color: "var(--accent-secondary)" }} />
                          <span>{driver.email}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <ShieldAlert size={12} style={{ color: "var(--state-warning)" }} />
                          <span>National ID: <strong style={{ color: "var(--text-primary)" }}>{driver.national_id || "N/A"}</strong></span>
                        </div>
                      </div>

                      {/* Bus Assignment Section */}
                      <div style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "12px",
                      }}>
                        <label className="form-label" style={{ fontSize: "0.65rem", display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                          <Bus size={10} /> Allocated Vehicle Assignment
                        </label>
                        <select
                          className="form-input"
                          style={{ width: "100%", padding: "6px 8px", fontSize: "0.8rem" }}
                          value={assignedVehicle?.id || ""}
                          onChange={(e) => handleAssignBus(driver.id, e.target.value)}
                          disabled={driver.status === "Unavailable"}
                          title={driver.status === "Unavailable" ? "Cannot assign unavailable driver to a bus" : ""}
                        >
                          <option value="">Standby (Unallocated / Parked)</option>
                          {vehicles.map(vehicle => (
                            <option 
                              key={vehicle.id} 
                              value={vehicle.id}
                              disabled={vehicle.active_driver_id !== null && vehicle.active_driver_id !== driver.id}
                            >
                              {vehicle.license_plate} - {vehicle.model} {vehicle.active_driver_id !== null && vehicle.active_driver_id !== driver.id ? " (Allocated)" : ""}
                            </option>
                          ))}
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
                <User size={18} style={{ color: "var(--accent-primary)" }} />
                {drawerMode === "add" ? "Register Roster Driver" : "Modify Profile Details"}
              </h2>
              <button onClick={() => setShowDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
              {/* Profile Photo Upload Field */}
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label className="form-label">Profile Photo</label>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "6px" }}>
                  <div 
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      border: "2px dashed var(--border-default)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      position: "relative"
                    }}
                  >
                    {formValues.avatar_url ? (
                      <img src={formValues.avatar_url} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Camera size={22} style={{ color: "var(--text-muted)" }} />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label 
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "var(--accent-primary)",
                        color: "#ffffff",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: isUploadingPhoto ? "not-allowed" : "pointer"
                      }}
                    >
                      <Upload size={14} />
                      {isUploadingPhoto ? "Uploading..." : formValues.avatar_url ? "Change Photo" : "Upload Photo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} disabled={isUploadingPhoto} />
                    </label>
                    {formValues.avatar_url && (
                      <button
                        type="button"
                        onClick={() => setFormValues(prev => ({ ...prev, avatar_url: "" }))}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--state-error)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 0
                        }}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className={`form-input ${formErrors.name ? "error" : ""}`}
                  placeholder="e.g. John Kamau"
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
                  placeholder="e.g. 32908422"
                  value={formValues.national_id}
                  onChange={handleInputChange}
                />
                {formErrors.national_id && <span className="form-error-text">{formErrors.national_id}</span>}
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
                    placeholder="e.g. 712 345 678"
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

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  className={`form-input ${formErrors.email ? "error" : ""}`}
                  placeholder="e.g. john.kamau@school.com"
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
                    background: "var(--accent-primary)",
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
                  ) : drawerMode === "add" ? "Register Driver" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

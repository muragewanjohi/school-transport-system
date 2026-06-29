"use client";

import React, { useState, useEffect } from "react";
import { 
  Bus, 
  Plus, 
  Wrench, 
  Fuel, 
  Gauge, 
  Trash2, 
  Edit, 
  X, 
  Calendar, 
  Activity, 
  Sparkles, 
  AlertCircle,
  AlertTriangle,
  User
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";

interface DBVehicle {
  id: string;
  license_plate: string;
  model: string;
  capacity: number;
  status: "Active" | "Maintenance" | "Out of Service";
  fuel_level: number;
  odometer: number;
  last_service_date: string | null;
  next_service_date: string | null;
  insurance_expiry: string | null;
}

interface DBMaintenanceLog {
  id: string;
  vehicle_id: string;
  description: string;
  cost: number | null;
  service_date: string;
  technician: string | null;
}

export default function FleetManagement() {
  const [vehicles, setVehicles] = useState<DBVehicle[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<DBMaintenanceLog[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<DBVehicle | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("All");

  // Add/Edit Drawer State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Bus Form State (Decoupled from drivers/conductors)
  const [formValues, setFormValues] = useState({
    license_plate: "",
    model: "",
    capacity: 30,
    status: "Active" as "Active" | "Maintenance" | "Out of Service",
    last_service_date: "",
    next_service_date: "",
    insurance_expiry: "",
  });

  // Maintenance Log Form State
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    description: "",
    cost: "",
    technician: "",
    service_date: new Date().toISOString().split("T")[0]
  });

  const fetchFleetData = async () => {
    setIsLoading(true);
    try {
      const fleetRes = await fetch("/api/fleet");
      const fleetJson = await fleetRes.json();
      
      if (fleetJson.success) {
        setVehicles(fleetJson.data);
      }
    } catch (err) {
      console.error("Failed to load fleet data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all fleet data on mount
  useEffect(() => {
    fetchFleetData();
  }, []);

  // Fetch maintenance logs when vehicle selected
  useEffect(() => {
    if (!selectedVehicle) {
      setMaintenanceLogs([]);
      return;
    }

    const fetchMaintenanceLogs = async () => {
      try {
        const res = await fetch(`/api/fleet/${selectedVehicle.id}/maintenance`);
        const json = await res.json();
        if (json.success) {
          setMaintenanceLogs(json.data);
        }
      } catch (err) {
        console.error(`Failed to load maintenance logs for ${selectedVehicle.id}:`, err);
      }
    };

    fetchMaintenanceLogs();
  }, [selectedVehicle]);

  // Handle Form Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: name === "capacity"
        ? Number(value) 
        : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  // Open Add Drawer
  const openAddDrawer = () => {
    setDrawerMode("add");
    setCurrentEditId(null);
    setFormValues({
      license_plate: "",
      model: "",
      capacity: 33,
      status: "Active",
      last_service_date: new Date().toISOString().split("T")[0],
      next_service_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // +90 days
      insurance_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // +1 year
    });
    setFormErrors({});
    setShowDrawer(true);
  };

  // Open Edit Drawer
  const openEditDrawer = (vehicle: DBVehicle) => {
    setDrawerMode("edit");
    setCurrentEditId(vehicle.id);
    setFormValues({
      license_plate: vehicle.license_plate,
      model: vehicle.model,
      capacity: vehicle.capacity,
      status: vehicle.status,
      last_service_date: vehicle.last_service_date || "",
      next_service_date: vehicle.next_service_date || "",
      insurance_expiry: vehicle.insurance_expiry || "",
    });
    setFormErrors({});
    setShowDrawer(true);
  };

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.license_plate.trim()) {
      errors.license_plate = "License plate is required";
    } else if (!/^[A-Z]{3}\s\d{3}[A-Z]$/i.test(formValues.license_plate.trim()) && formValues.license_plate.length < 5) {
      errors.license_plate = "Enter a valid plate number (e.g. KCD 123X)";
    }
    
    if (!formValues.model.trim()) {
      errors.model = "Bus model description is required";
    }
    if (formValues.capacity <= 0) {
      errors.capacity = "Capacity must be positive";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Bus Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitLoading(true);

    try {
      if (drawerMode === "add") {
        const res = await fetch("/api/fleet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();
        
        if (json.success) {
          await fetchFleetData();
          setShowDrawer(false);
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to onboard bus: ${errorMsg}`);
        }
      } else {
        const res = await fetch(`/api/fleet/${currentEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues)
        });
        const json = await res.json();

        if (json.success) {
          await fetchFleetData();
          if (selectedVehicle?.id === currentEditId) {
            setSelectedVehicle({ ...selectedVehicle, ...formValues });
          }
          setShowDrawer(false);
        } else {
          const errorMsg = json.error || (json.errors ? Object.entries(json.errors).map(([k, v]) => `${k}: ${v}`).join(", ") : "Unknown validation error");
          alert(`Failed to update bus: ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error("Form submit failure:", err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Delete Bus
  const handleDeleteBus = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to retire this vehicle from the active fleet?")) return;

    try {
      const res = await fetch(`/api/fleet/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        await fetchFleetData();
        if (selectedVehicle?.id === id) {
          setSelectedVehicle(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete bus:", err);
    }
  };

  // Add Maintenance Log Record
  const handleAddMaintenanceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !maintenanceForm.description.trim()) return;

    try {
      const payload = {
        description: maintenanceForm.description,
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
        service_date: maintenanceForm.service_date,
        technician: maintenanceForm.technician || undefined
      };

      const res = await fetch(`/api/fleet/${selectedVehicle.id}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        const resLogs = await fetch(`/api/fleet/${selectedVehicle.id}/maintenance`);
        const jsonLogs = await resLogs.json();
        if (jsonLogs.success) {
          setMaintenanceLogs(jsonLogs.data);
        }

        await fetchFleetData();
        setSelectedVehicle({
          ...selectedVehicle,
          last_service_date: payload.service_date,
          next_service_date: new Date(Date.parse(payload.service_date) + 90*24*60*60*1000).toISOString().split("T")[0]
        });

        // Reset Form
        setMaintenanceForm({
          description: "",
          cost: "",
          technician: "",
          service_date: new Date().toISOString().split("T")[0]
        });
        setShowMaintenanceForm(false);
      } else {
        const errorMsg = json.error || "Unknown validation error";
        alert(`Failed to add maintenance log: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Failed to add maintenance log:", err);
    }
  };

  const simulateStatusChange = async (vehicleId: string, status: "Active" | "Maintenance" | "Out of Service") => {
    try {
      const res = await fetch(`/api/fleet/${vehicleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) {
        await fetchFleetData();
        if (selectedVehicle?.id === vehicleId) {
          setSelectedVehicle({ ...selectedVehicle, status });
        }
      }
    } catch (err) {
      console.error("Failed to update status simulator:", err);
    }
  };

  // Calculations for KPI Metrics
  const totalBuses = vehicles.length;
  const activeBuses = vehicles.filter(v => v.status === "Active").length;
  const maintenanceBuses = vehicles.filter(v => v.status === "Maintenance").length;
  const outOfServiceBuses = vehicles.filter(v => v.status === "Out of Service").length;
  const totalCapacity = vehicles.reduce((acc, v) => acc + v.capacity, 0);

  // Filtered vehicles list
  const filteredVehicles = vehicles.filter(v => 
    filterStatus === "All" ? true : v.status === filterStatus
  );

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* CSS Animation Keyframes injection */}
      <style jsx global>{`
        @keyframes pulse-green {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes pulse-amber {
          0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); }
          100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
        }
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(244, 63, 148, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(244, 63, 148, 0); }
          100% { box-shadow: 0 0 0 0 rgba(244, 63, 148, 0); }
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .pulse-dot.Active {
          background-color: var(--state-success);
          animation: pulse-green 2s infinite;
        }
        .pulse-dot.Maintenance {
          background-color: var(--state-warning);
          animation: pulse-amber 2s infinite;
        }
        .pulse-dot.Out_of_Service {
          background-color: var(--state-error);
          animation: pulse-red 2s infinite;
        }
        .bus-card {
          position: relative;
          cursor: pointer;
          border: 1px solid var(--border-default);
          background: rgba(255, 255, 255, 0.01);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.3s ease;
        }
        .bus-card:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }
        .bus-card.selected {
          border-color: var(--accent-secondary);
          background: rgba(99, 102, 241, 0.04);
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
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
          width: 500px;
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
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
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
          transition: border-color 0.2s;
        }
        .form-input:focus {
          border-color: var(--accent-secondary);
        }
        .form-input.error {
          border-color: var(--state-error);
        }
        .form-error-text {
          font-size: 0.75rem;
          color: var(--state-error);
        }
        .badge-status {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 12px;
          text-transform: uppercase;
        }
        .badge-status.Active {
          background: rgba(16, 185, 129, 0.1);
          color: var(--state-success);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        .badge-status.Maintenance {
          background: rgba(234, 179, 8, 0.1);
          color: var(--state-warning);
          border: 1px solid rgba(234, 179, 8, 0.2);
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

      {/* Main Panel Content */}
      <main className="main-content">
        {/* Top Header Section */}
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Fleet Operations Command Hub</span>
            <span style={{ 
              marginLeft: "12px", 
              background: "rgba(16,185,129,0.1)", 
              color: "var(--accent-primary)", 
              padding: "3px 8px", 
              borderRadius: "4px", 
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid rgba(16,185,129,0.2)"
            }}>
              Active Term Monitoring
            </span>
          </div>
          <UserProfileBadge />
        </header>

        {/* Fleet KPI Metric Cards */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Total Buses</div>
            <div className="stat-value">{totalBuses}</div>
            <div className="stat-desc">Registered transport vehicles</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Operational Status</div>
            <div className="stat-value" style={{ fontSize: "1.5rem", display: "flex", gap: "12px", alignItems: "center", marginTop: "12px", marginBottom: "12px" }}>
              <span style={{ color: "var(--state-success)" }}>{activeBuses} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Act</span></span>
              <span style={{ color: "var(--state-warning)" }}>{maintenanceBuses} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Maint</span></span>
              <span style={{ color: "var(--state-error)" }}>{outOfServiceBuses} <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Out</span></span>
            </div>
            <div className="stat-desc">Active, servicing, and retired assets</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Seating Capacity</div>
            <div className="stat-value">{totalCapacity}</div>
            <div className="stat-desc">Cumulative seats across active fleet</div>
          </div>
        </section>

        {/* Dashboard split viewport */}
        <section className="dashboard-content-layout">
          {/* Main Fleet List Section */}
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="panel-title" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                  <Bus size={20} style={{ color: "var(--accent-primary)" }} />
                  School Vehicle Inventory
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  ({filteredVehicles.length} vehicles matching)
                </span>
              </div>
              <button 
                onClick={openAddDrawer}
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
                  gap: "6px",
                  boxShadow: "0 4px 12px rgba(16,185,129,0.2)"
                }}
              >
                <Plus size={16} />
                Onboard New Bus
              </button>
            </div>

            {/* Filter Toolbar */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "16px"
            }}>
              <div style={{ display: "flex", gap: "8px" }}>
                {["All", "Active", "Maintenance", "Out of Service"].map(status => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    style={{
                      background: filterStatus === status ? "var(--bg-surface-hover)" : "transparent",
                      border: "1px solid " + (filterStatus === status ? "var(--border-default)" : "transparent"),
                      color: filterStatus === status ? "var(--text-primary)" : "var(--text-muted)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={12} style={{ color: "var(--accent-secondary)" }} />
                Click on a vehicle to view detailed logs and simulation options.
              </div>
            </div>

            {/* List Spinner */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px", color: "var(--text-muted)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "32px", height: "32px", border: "4px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent-secondary)", borderRadius: "50%", animation: "radar-pulse 1s infinite linear" }}></div>
                  <span>Loading fleet catalog...</span>
                </div>
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <Bus size={48} style={{ strokeWidth: 1, marginBottom: "16px", color: "var(--text-muted)" }} />
                <span>No vehicles match the selected filter.</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", overflowY: "auto", maxHeight: "600px", paddingRight: "4px" }}>
                {filteredVehicles.map((vehicle) => {
                  const isSelected = selectedVehicle?.id === vehicle.id;
                  const fuelPercent = vehicle.fuel_level;
                  let fuelColor = "var(--state-success)";
                  if (fuelPercent <= 15) fuelColor = "var(--state-error)";
                  else if (fuelPercent <= 45) fuelColor = "var(--state-warning)";

                  // Check compliance statuses
                  const today = new Date();
                  const insuranceExpired = vehicle.insurance_expiry ? new Date(vehicle.insurance_expiry) < today : false;
                  const serviceOverdue = vehicle.next_service_date ? new Date(vehicle.next_service_date) < today : false;

                  return (
                    <div 
                      key={vehicle.id}
                      onClick={() => setSelectedVehicle(vehicle)}
                      className={`bus-card ${isSelected ? "selected" : ""}`}
                    >
                      {/* Top Header Card */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{
                              background: "rgba(255,255,255,0.08)",
                              color: "var(--text-primary)",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: "0.95rem",
                              border: "1px solid var(--border-default)"
                            }}>
                              {vehicle.license_plate}
                            </span>
                            <span className={`badge-status ${vehicle.status.replace(" ", "_")}`}>
                              <span className={`pulse-dot ${vehicle.status.replace(" ", "_")}`} style={{ marginRight: "6px", verticalAlign: "middle" }}></span>
                              {vehicle.status}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                            {vehicle.model}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEditDrawer(vehicle); }}
                            style={{ background: "rgba(255,255,255,0.04)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--text-muted)" }}
                            title="Edit Vehicle"
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteBus(vehicle.id, e)}
                            style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                            title="Retire Vehicle"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Seating Capacity info row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "10px 0", marginBottom: "12px" }}>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Seating Capacity</div>
                          <div style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                            <User size={14} style={{ color: "var(--accent-secondary)" }} />
                            <span style={{ fontWeight: 500 }}>{vehicle.capacity} Seats Available</span>
                          </div>
                        </div>
                      </div>

                      {/* Seating Capacity info row placeholder border */}
                      <div style={{ paddingBottom: "1px" }} />

                      {/* Expiry Checks Alerts */}
                      {(insuranceExpired || serviceOverdue) && (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          marginTop: "12px",
                          background: "rgba(244,63,94,0.06)",
                          border: "1px solid rgba(244,63,94,0.15)",
                          borderRadius: "6px",
                          padding: "6px 10px"
                        }}>
                          {insuranceExpired && (
                            <div style={{ fontSize: "0.7rem", color: "var(--state-error)", display: "flex", alignItems: "center", gap: "4px" }}>
                              <AlertTriangle size={10} />
                              Insurance Expired! ({vehicle.insurance_expiry})
                            </div>
                          )}
                          {serviceOverdue && (
                            <div style={{ fontSize: "0.7rem", color: "var(--state-error)", display: "flex", alignItems: "center", gap: "4px" }}>
                              <AlertTriangle size={10} />
                              Maintenance Service Overdue! ({vehicle.next_service_date})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Panel: Details, Maintenance & Simulator */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* 1. Maintenance Log Card for Selected Vehicle */}
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">
                  <Wrench size={18} style={{ color: "var(--accent-secondary)" }} />
                  {selectedVehicle 
                    ? `Logs: ${selectedVehicle.license_plate}` 
                    : "Maintenance Logs"}
                </span>
                {selectedVehicle && (
                  <button
                    onClick={() => setShowMaintenanceForm(!showMaintenanceForm)}
                    style={{
                      background: "rgba(99,102,241,0.1)",
                      color: "var(--accent-secondary)",
                      border: "1px solid rgba(99,102,241,0.2)",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    {showMaintenanceForm ? "Cancel" : "Add Service"}
                  </button>
                )}
              </div>

              {!selectedVehicle ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "180px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  <Wrench size={32} style={{ strokeWidth: 1.2, marginBottom: "8px" }} />
                  <span>Select a bus to view service records</span>
                </div>
              ) : showMaintenanceForm ? (
                /* Add Maintenance Record Form */
                <form onSubmit={handleAddMaintenanceLog} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Service Description</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="e.g. Engine oil & filter change"
                      value={maintenanceForm.description}
                      onChange={(e) => setMaintenanceForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Cost (KES)</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Cost in KES"
                        value={maintenanceForm.cost}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, cost: e.target.value }))}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Service Date</label>
                      <input
                        type="date"
                        className="form-input"
                        required
                        value={maintenanceForm.service_date}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, service_date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Technician / Garage</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Toyotsu Auto East Africa"
                      value={maintenanceForm.technician}
                      onChange={(e) => setMaintenanceForm(prev => ({ ...prev, technician: e.target.value }))}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      background: "var(--accent-secondary)",
                      color: "#ffffff",
                      border: "none",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      marginTop: "6px"
                    }}
                  >
                    Record Service Check
                  </button>
                </form>
              ) : (
                /* Maintenance Logs List */
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "220px", overflowY: "auto" }}>
                  {maintenanceLogs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      No service logs found for this vehicle.
                    </div>
                  ) : (
                    maintenanceLogs.map(log => (
                      <div key={log.id} style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{log.description}</span>
                          {log.cost && (
                            <span style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                              KES {log.cost.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Calendar size={10} /> {log.service_date}
                          </span>
                          {log.technician && (
                            <span>By: {log.technician}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 2. Interactive Telemetry Simulator */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">
                  <Activity size={18} style={{ color: "var(--state-error)" }} />
                  Telemetry & State Simulator
                </span>
              </div>

              {!selectedVehicle ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "180px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  <Activity size={32} style={{ strokeWidth: 1.2, marginBottom: "8px" }} />
                  <span>Select a bus to run telemetry simulations</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                    <Sparkles size={12} style={{ color: "var(--accent-secondary)" }} />
                    Simulating: <strong style={{ color: "var(--text-primary)" }}>{selectedVehicle.license_plate}</strong>
                  </div>

                  {/* Simulator buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                    <button
                      onClick={async () => {
                        const randomLat = -1.2721 + (Math.random() * 0.02 - 0.01);
                        const randomLng = 36.8045 + (Math.random() * 0.02 - 0.01);
                        alert(`Telemetry GPS update sent for ${selectedVehicle.license_plate}: Lat ${randomLat.toFixed(5)}, Lng ${randomLng.toFixed(5)}`);
                        try {
                          await fetch("/api/telemetry", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              vehicle_id: selectedVehicle.id.includes("bus-") ? "8c9ad841-f762-4217-a021-9876251b5bcf" : selectedVehicle.id,
                              route_id: "782cd841-f762-4217-a021-9876251b5bca",
                              latitude: randomLat,
                              longitude: randomLng,
                              speed: 45,
                              bearing: 180
                            })
                          });
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      style={{
                        background: "rgba(16,185,129,0.1)",
                        color: "var(--accent-primary)",
                        border: "1px solid rgba(16,185,129,0.2)",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px"
                      }}
                    >
                      <Activity size={12} />
                      Simulate GPS Ping
                    </button>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-default)", marginTop: "10px", paddingTop: "10px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px" }}>Status Override:</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["Active", "Maintenance", "Out of Service"] as const).map(status => (
                        <button
                          key={status}
                          onClick={() => simulateStatusChange(selectedVehicle.id, status)}
                          disabled={selectedVehicle.status === status}
                          style={{
                            flex: 1,
                            background: selectedVehicle.status === status ? "var(--bg-surface-hover)" : "rgba(255,255,255,0.03)",
                            border: "1px solid " + (selectedVehicle.status === status ? "var(--accent-secondary)" : "var(--border-default)"),
                            color: selectedVehicle.status === status ? "var(--text-primary)" : "var(--text-muted)",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            cursor: selectedVehicle.status === status ? "default" : "pointer"
                          }}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 3. Onboard / Edit Bus Drawer Dialog */}
      {showDrawer && (
        <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Bus size={22} style={{ color: "var(--accent-primary)" }} />
                {drawerMode === "add" ? "Onboard School Bus" : "Modify Vehicle Details"}
              </h2>
              <button 
                onClick={() => setShowDrawer(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
              {/* License Plate */}
              <div className="form-group">
                <label className="form-label">License Plate *</label>
                <input
                  type="text"
                  name="license_plate"
                  className={`form-input ${formErrors.license_plate ? "error" : ""}`}
                  placeholder="e.g. KCD 432Y"
                  value={formValues.license_plate}
                  onChange={handleInputChange}
                />
                {formErrors.license_plate && <span className="form-error-text">{formErrors.license_plate}</span>}
              </div>

              {/* Model Description */}
              <div className="form-group">
                <label className="form-label">Bus Maker & Model *</label>
                <input
                  type="text"
                  name="model"
                  className={`form-input ${formErrors.model ? "error" : ""}`}
                  placeholder="e.g. Isuzu FRR 33-Seater"
                  value={formValues.model}
                  onChange={handleInputChange}
                />
                {formErrors.model && <span className="form-error-text">{formErrors.model}</span>}
              </div>

              {/* Seating Capacity */}
              <div className="form-group">
                <label className="form-label">Seating Capacity *</label>
                <input
                  type="number"
                  name="capacity"
                  className={`form-input ${formErrors.capacity ? "error" : ""}`}
                  value={formValues.capacity}
                  onChange={handleInputChange}
                />
                {formErrors.capacity && <span className="form-error-text">{formErrors.capacity}</span>}
              </div>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Asset Status</label>
                <select
                  name="status"
                  className="form-input"
                  value={formValues.status}
                  onChange={handleInputChange}
                >
                  <option value="Active">Active / In Service</option>
                  <option value="Maintenance">Maintenance Service</option>
                  <option value="Out of Service">Out of Service / Retired</option>
                </select>
              </div>

              {/* Compliance & Servicing Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Last Service Date</label>
                  <input
                    type="date"
                    name="last_service_date"
                    className="form-input"
                    value={formValues.last_service_date}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Next Service Date</label>
                  <input
                    type="date"
                    name="next_service_date"
                    className="form-input"
                    value={formValues.next_service_date}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Insurance Expiry Date</label>
                <input
                  type="date"
                  name="insurance_expiry"
                  className="form-input"
                  value={formValues.insurance_expiry}
                  onChange={handleInputChange}
                />
              </div>

              {/* Compliance & Servicing Fields border separator */}

              {/* Submit Buttons */}
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
                    fontSize: "0.9rem",
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
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: isSubmitLoading ? "default" : "pointer"
                  }}
                >
                  {isSubmitLoading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <span className="spinner-icon"></span>
                      Saving...
                    </span>
                  ) : drawerMode === "add" 
                    ? "Onboard Bus" 
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

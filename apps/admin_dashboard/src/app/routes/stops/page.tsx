"use client";

import React, { useState, useEffect } from "react";
import { 
  MapPin, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Compass, 
  Search, 
  SlidersHorizontal,
  Navigation,
  Globe,
  Radio,
  Eye
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";

interface DBStop {
  id: string;
  route_id: string;
  name: string;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  sequence_no: number;
  geofence_radius_meters: number;
  stop_type: "PICKUP" | "DROPOFF" | "BOTH";
}

interface DBRoute {
  id: string;
  name: string;
}

export default function StopsManagement() {
  const [stops, setStops] = useState<DBStop[]>([]);
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  // Add/Edit Drawer State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form Values
  const [formValues, setFormValues] = useState({
    route_id: "",
    name: "",
    latitude: -1.2921,
    longitude: 36.8219,
    sequence_no: 1,
    geofence_radius_meters: 50,
    stop_type: "BOTH" as "PICKUP" | "DROPOFF" | "BOTH"
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [stopsRes, routesRes] = await Promise.all([
        fetch("/api/stops"),
        fetch("/api/routes")
      ]);

      const stopsJson = await stopsRes.json();
      const routesJson = await routesRes.json();

      if (stopsJson.success) {
        setStops(stopsJson.data);
      }
      if (routesJson.success) {
        setRoutes(routesJson.data);
      }
    } catch (err) {
      console.error("Failed to load stops or routes data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: name === "latitude" || name === "longitude"
        ? parseFloat(value)
        : name === "sequence_no" || name === "geofence_radius_meters"
        ? parseInt(value) || 0
        : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const openAddDrawer = () => {
    setDrawerMode("add");
    setCurrentEditId(null);
    setFormValues({
      route_id: routes[0]?.id || "",
      name: "",
      latitude: -1.2921,
      longitude: 36.8219,
      sequence_no: 1,
      geofence_radius_meters: 50,
      stop_type: "BOTH"
    });
    setFormErrors({});
    setShowDrawer(true);
  };

  const openEditDrawer = (stop: DBStop) => {
    setDrawerMode("edit");
    setCurrentEditId(stop.id);
    setFormValues({
      route_id: stop.route_id,
      name: stop.name,
      latitude: stop.location?.coordinates?.[1] ?? -1.2921,
      longitude: stop.location?.coordinates?.[0] ?? 36.8219,
      sequence_no: stop.sequence_no,
      geofence_radius_meters: stop.geofence_radius_meters,
      stop_type: stop.stop_type
    });
    setFormErrors({});
    setShowDrawer(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.route_id) {
      errors.route_id = "Route selection is required";
    }
    if (!formValues.name.trim()) {
      errors.name = "Stop name is required";
    } else if (formValues.name.length < 2) {
      errors.name = "Stop name must be at least 2 characters";
    }
    if (isNaN(formValues.latitude) || formValues.latitude < -90 || formValues.latitude > 90) {
      errors.latitude = "Enter a valid latitude (-90 to 90)";
    }
    if (isNaN(formValues.longitude) || formValues.longitude < -180 || formValues.longitude > 180) {
      errors.longitude = "Enter a valid longitude (-180 to 180)";
    }
    if (formValues.sequence_no <= 0) {
      errors.sequence_no = "Sequence number must be 1 or greater";
    }
    if (formValues.geofence_radius_meters < 5) {
      errors.geofence_radius_meters = "Geofence radius must be at least 5 meters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitLoading(true);
    try {
      const payload = {
        route_id: formValues.route_id,
        name: formValues.name,
        latitude: formValues.latitude,
        longitude: formValues.longitude,
        sequence_no: formValues.sequence_no,
        geofence_radius_meters: formValues.geofence_radius_meters,
        stop_type: formValues.stop_type
      };

      if (drawerMode === "add") {
        const res = await fetch("/api/stops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          await fetchData();
          setShowDrawer(false);
        } else {
          alert(json.error || "Failed to create stop");
        }
      } else {
        const res = await fetch(`/api/stops/${currentEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.success) {
          await fetchData();
          setShowDrawer(false);
        } else {
          alert(json.error || "Failed to update stop");
        }
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred while saving the stop.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteStop = async (id: string) => {
    if (!confirm("Are you sure you want to delete this stop? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/api/stops/${id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
      } else {
        alert(json.error || "Failed to delete stop");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting the stop.");
    }
  };

  // Filter stops
  const filteredStops = stops.filter(stop => {
    const route = routes.find(r => r.id === stop.route_id);
    const matchesSearch = 
      stop.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (route && route.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRoute = routeFilter === "All" || stop.route_id === routeFilter;
    const matchesType = typeFilter === "All" || stop.stop_type === typeFilter;

    return matchesSearch && matchesRoute && matchesType;
  });

  return (
    <div className="app-container">
      <Sidebar />

      <main className="main-content">
        <header className="main-header">
          <div>
            <span className="header-subtitle">Route Planning</span>
            <h1 className="header-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MapPin size={24} style={{ color: "var(--accent-primary)" }} />
              Stops & Stages
            </h1>
          </div>
          <UserProfileBadge />
        </header>

        <div className="content-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Controls Bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            background: "var(--bg-glass)",
            border: "1px solid var(--border-default)",
            padding: "16px",
            borderRadius: "12px",
            backdropFilter: "blur(8px)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "280px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search by stop or route name..."
                  className="form-input"
                  style={{ paddingLeft: "32px", fontSize: "0.85rem" }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Route Filter */}
              <select
                className="form-input"
                style={{ width: "160px", fontSize: "0.85rem" }}
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
              >
                <option value="All">All Routes</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              {/* Type Filter */}
              <select
                className="form-input"
                style={{ width: "130px", fontSize: "0.85rem" }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="PICKUP">PICKUP</option>
                <option value="DROPOFF">DROPOFF</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>

            <button onClick={openAddDrawer} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
              <Plus size={16} />
              Add Route Stop
            </button>
          </div>

          {/* Table Container */}
          <div style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            overflow: "hidden",
            backdropFilter: "blur(8px)"
          }}>
            {isLoading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                Loading stops and stages...
              </div>
            ) : filteredStops.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                No stops found matching your search and filter settings.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="student-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-default)", background: "rgba(255,255,255,0.01)" }}>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", width: "60px" }}>Seq</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Stop Name</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Route Name</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Coordinates</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", width: "100px" }}>Geofence</th>
                      <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)", width: "100px" }}>Type</th>
                      <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)", width: "100px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStops.map(stop => {
                      const route = routes.find(r => r.id === stop.route_id);
                      return (
                        <tr key={stop.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", transition: "background 0.2s ease" }}>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              backgroundColor: "rgba(99, 102, 241, 0.1)",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--accent-secondary)",
                              fontWeight: "bold",
                              fontSize: "0.75rem"
                            }}>
                              {stop.sequence_no}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-primary)" }}>{stop.name}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-secondary)", fontWeight: 500, fontSize: "0.85rem" }}>
                              <Compass size={14} />
                              {route ? route.name : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unknown Route</span>}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              <Globe size={14} />
                              {stop.location?.coordinates?.[1]?.toFixed(5) ?? "0.00000"}, {stop.location?.coordinates?.[0]?.toFixed(5) ?? "0.00000"}
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                              <Radio size={14} style={{ color: "var(--accent-primary)" }} />
                              {stop.geofence_radius_meters}m
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              background: stop.stop_type === "PICKUP" ? "rgba(16,185,129,0.1)" : stop.stop_type === "DROPOFF" ? "rgba(244,63,94,0.1)" : "rgba(99,102,241,0.1)",
                              color: stop.stop_type === "PICKUP" ? "var(--state-success)" : stop.stop_type === "DROPOFF" ? "var(--state-error)" : "var(--accent-secondary)"
                            }}>
                              {stop.stop_type}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            <button
                              onClick={() => openEditDrawer(stop)}
                              style={{ background: "rgba(99,102,241,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--accent-secondary)", marginRight: "8px" }}
                              title="Edit Stop"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteStop(stop.id)}
                              style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                              title="Delete Stop"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Slideout Onboard Drawer */}
      {showDrawer && (
        <div className="drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <MapPin size={18} style={{ color: "var(--accent-primary)" }} />
                {drawerMode === "edit" ? "Edit Route Stop Point" : "Add Route Stop Point"}
              </h2>
              <button onClick={() => setShowDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Route Selection */}
              <div className="form-group">
                <label className="form-label">Route *</label>
                <select
                  name="route_id"
                  required
                  className="form-input"
                  value={formValues.route_id}
                  onChange={handleInputChange}
                >
                  <option value="" disabled>-- Select Route --</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                {formErrors.route_id && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.route_id}</span>}
              </div>

              {/* Stop Name */}
              <div className="form-group">
                <label className="form-label">Stop Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Ruaka Joyland"
                  className="form-input"
                  value={formValues.name}
                  onChange={handleInputChange}
                />
                {formErrors.name && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.name}</span>}
              </div>

              {/* Lat/Lng Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Latitude *</label>
                  <input
                    type="number"
                    name="latitude"
                    step="0.000001"
                    required
                    className="form-input"
                    value={isNaN(formValues.latitude) ? "" : formValues.latitude}
                    onChange={handleInputChange}
                  />
                  {formErrors.latitude && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.latitude}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude *</label>
                  <input
                    type="number"
                    name="longitude"
                    step="0.000001"
                    required
                    className="form-input"
                    value={isNaN(formValues.longitude) ? "" : formValues.longitude}
                    onChange={handleInputChange}
                  />
                  {formErrors.longitude && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.longitude}</span>}
                </div>
              </div>

              {/* Seq/Radius Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Sequence No *</label>
                  <input
                    type="number"
                    name="sequence_no"
                    required
                    min="1"
                    className="form-input"
                    value={formValues.sequence_no}
                    onChange={handleInputChange}
                  />
                  {formErrors.sequence_no && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.sequence_no}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Geofence Radius (meters) *</label>
                  <input
                    type="number"
                    name="geofence_radius_meters"
                    required
                    min="5"
                    className="form-input"
                    value={formValues.geofence_radius_meters}
                    onChange={handleInputChange}
                  />
                  {formErrors.geofence_radius_meters && <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{formErrors.geofence_radius_meters}</span>}
                </div>
              </div>

              {/* Stop Type */}
              <div className="form-group">
                <label className="form-label">Stop Type *</label>
                <select
                  name="stop_type"
                  required
                  className="form-input"
                  value={formValues.stop_type}
                  onChange={handleInputChange}
                >
                  <option value="BOTH">BOTH (Pickup and Dropoff)</option>
                  <option value="PICKUP">PICKUP Only</option>
                  <option value="DROPOFF">DROPOFF Only</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
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
                    cursor: "pointer",
                    fontSize: "0.85rem"
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
                    fontWeight: 600,
                    cursor: isSubmitLoading ? "default" : "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  {isSubmitLoading ? "Saving Stop..." : (drawerMode === "edit" ? "Update Route Stop" : "Save Route Stop")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

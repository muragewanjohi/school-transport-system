"use client";

import React, { useState, useEffect } from "react";
import { 
  Clock, 
  Search, 
  RefreshCw, 
  Compass, 
  Truck, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  XCircle,
  HelpCircle,
  Edit3,
  Calendar,
  X,
  Users
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { tripTypeLabel } from "@/lib/scheduleFormValidation";
import { tripStatusIconColor, tripStatusStyles } from "@/lib/tripStatusUi";
import { canOverrideTodayTripStatus } from "@/lib/todayTripOverride";

interface DBRoute {
  id: string;
  name: string;
}

interface DBSchedule {
  id: string;
  route_id: string;
  name: string;
  departure_time: string;
  direction: "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";
  target_grades: string[];
  days_of_week: number[];
  vehicle_id?: string | null;
}

interface DBTrip {
  id: string;
  schedule_id: string;
  route_id: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  trip_date: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  status_override?: string | null;
  description?: string | null;
  custom_departure_time?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface DBVehicle {
  id: string;
  license_plate: string;
  model: string;
}

interface DBDriver {
  id: string;
  name: string;
  phone: string;
}

interface DBStudent {
  id: string;
  name: string;
  schedule_ids: string[];
  route_id: string;
  status: string;
}

export default function TodayTrips() {
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [schedules, setSchedules] = useState<DBSchedule[]>([]);
  const [trips, setTrips] = useState<DBTrip[]>([]);
  const [vehicles, setVehicles] = useState<DBVehicle[]>([]);
  const [drivers, setDrivers] = useState<DBDriver[]>([]);
  const [students, setStudents] = useState<DBStudent[]>([]);
  const [manifestsMap, setManifestsMap] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedRun, setSelectedRun] = useState<{
    status: string;
    dbTrip?: DBTrip;
    schedule: DBSchedule;
    route?: DBRoute;
  } | null>(null);
  const [modalStatus, setModalStatus] = useState("Scheduled");
  const [modalDescription, setModalDescription] = useState("");
  const [modalNewTime, setModalNewTime] = useState("");
  const [timeValidationError, setTimeValidationError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [routesRes, schedulesRes, tripsRes, vehiclesRes, driversRes, studentsRes] = await Promise.all([
        fetch("/api/routes"),
        fetch("/api/schedules"),
        fetch("/api/trips"),
        fetch("/api/fleet"),
        fetch("/api/drivers"),
        fetch("/api/students")
      ]);

      const [routesJson, schedulesJson, tripsJson, vehiclesJson, driversJson, studentsJson] = await Promise.all([
        routesRes.json(),
        schedulesRes.json(),
        tripsRes.json(),
        vehiclesRes.json(),
        driversRes.json(),
        studentsRes.json()
      ]);

      if (routesJson.success) setRoutes(routesJson.data || []);
      if (schedulesJson.success) setSchedules(schedulesJson.data || []);
      if (vehiclesJson.success) setVehicles(vehiclesJson.data || []);
      if (driversJson.success) setDrivers(driversJson.data || []);
      if (studentsJson.success) setStudents(studentsJson.data || []);

      const tripsList: DBTrip[] = tripsJson.data || [];
      setTrips(tripsList);

      // Fetch manifests for existing trips today
      const todayStr = new Date().toISOString().split("T")[0];
      const todayTrips = tripsList.filter(t => t.trip_date === todayStr);

      const manifestsTempMap: Record<string, any[]> = {};
      await Promise.all(
        todayTrips.map(async (trip) => {
          try {
            const res = await fetch(`/api/trips?trip_id=${trip.id}`);
            const json = await res.json();
            if (json.success) {
              manifestsTempMap[trip.id] = json.data || [];
            }
          } catch (e) {
            console.error(`Error loading manifest for trip ${trip.id}:`, e);
          }
        })
      );
      setManifestsMap(manifestsTempMap);

    } catch (err) {
      console.error("Failed to load today's trips data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get current date string and weekday
  const today = new Date();
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedToday = today.toLocaleDateString('en-US', dateOptions);
  
  const todayStr = today.toISOString().split("T")[0];
  const jsDay = today.getDay();
  const dbDay = jsDay === 0 ? 7 : jsDay; // Mon=1, ..., Sat=6, Sun=7

  // Filter schedules that run today
  const activeSchedulesToday = schedules.filter(s => s.days_of_week.includes(dbDay));

  // Helper to map DB trips to UI status
  const getMappedStatus = (scheduleTime: string, dbTrip?: DBTrip) => {
    if (dbTrip) {
      if (dbTrip.status_override) return dbTrip.status_override;
      if (dbTrip.status === "completed") return "Completed";
      if (dbTrip.status === "cancelled") return "Cancelled";
      if (dbTrip.status === "in_progress") return "Active";
    }

    // Compare departure time (format: "HH:MM:SS" or "HH:MM")
    const [schedH, schedM] = scheduleTime.split(":").map(Number);
    const now = new Date();
    const schedDate = new Date();
    schedDate.setHours(schedH, schedM, 0, 0);

    const diffMs = now.getTime() - schedDate.getTime();
    const diffMins = diffMs / (1000 * 60);

    if (diffMins > 30) return "Missed";
    if (diffMins > 5) return "Delayed";
    return "Scheduled";
  };

  // Open Update Modal
  const openUpdateModal = (item: {
    status: string;
    dbTrip?: DBTrip;
    schedule: DBSchedule;
    route?: DBRoute;
  }) => {
    if (!canOverrideTodayTripStatus({ displayStatus: item.status, tripStatus: item.dbTrip?.status })) {
      return;
    }
    setSelectedRun(item);
    setModalStatus(item.status);
    setModalDescription(item.dbTrip?.description || "");
    
    // Default new time to original or customized time
    const schedTime = item.schedule.departure_time.substring(0, 5);
    setModalNewTime(item.dbTrip?.custom_departure_time || schedTime);
    setTimeValidationError("");
    setShowModal(true);
  };

  // Save Modal Action
  const handleSaveModal = async () => {
    if (!selectedRun) return;
    if (
      !canOverrideTodayTripStatus({
        displayStatus: selectedRun.status,
        tripStatus: selectedRun.dbTrip?.status,
      })
    ) {
      return;
    }

    // Validate delayed time
    if (modalStatus === "Delayed") {
      const originalTime = selectedRun.schedule.departure_time.substring(0, 5);
      if (modalNewTime <= originalTime) {
        setTimeValidationError(`New scheduled time must be later than original departure time (${originalTime})`);
        return;
      }
    }

    setIsSaving(true);
    setTimeValidationError("");

    try {
      // Map display status to DB status
      let dbStatus: "scheduled" | "in_progress" | "completed" | "cancelled" = "scheduled";
      if (modalStatus === "Active") dbStatus = "in_progress";
      else if (modalStatus === "Completed") dbStatus = "completed";
      else if (modalStatus === "Cancelled") dbStatus = "cancelled";

      const tripId = selectedRun.dbTrip?.id;

      const payload = {
        status: dbStatus,
        status_override: modalStatus,
        description: modalDescription || null,
        custom_departure_time: modalStatus === "Delayed" ? modalNewTime : null
      };

      if (tripId) {
        // Update existing trip
        const res = await fetch("/api/trips", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: tripId,
            ...payload
          })
        });
        const json = await res.json();
        if (!json.success) alert(`Failed to update status: ${json.error}`);
      } else {
        // Create new trip run
        const activeDriver = drivers.length > 0 ? drivers[0].id : null;

        const res = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schedule_id: selectedRun.schedule.id,
            route_id: selectedRun.schedule.route_id,
            vehicle_id: selectedRun.schedule.vehicle_id || null,
            driver_id: activeDriver,
            ...payload
          })
        });
        const json = await res.json();
        if (!json.success) alert(`Failed to initiate trip: ${json.error}`);
      }

      setShowModal(false);
      await fetchData();
    } catch (e) {
      console.error(e);
      alert("Error saving overrides.");
    } finally {
      setIsSaving(false);
    }
  };

  // Merge schedules and trip records
  const joinedTrips = activeSchedulesToday.map(sched => {
    const route = routes.find(r => r.id === sched.route_id);
    const dbTrip = trips.find(t => t.schedule_id === sched.id && t.trip_date === todayStr);
    const vehicle = vehicles.find(v => v.id === (dbTrip?.vehicle_id || sched.vehicle_id));
    const driver = dbTrip?.driver_id ? drivers.find(d => d.id === dbTrip.driver_id) : null;
    const computedStatus = getMappedStatus(sched.departure_time, dbTrip);

    // Calculate checked-in students
    let checkedIn = 0;
    let total = students.filter(s => s.schedule_ids?.includes(sched.id)).length;

    if (dbTrip && manifestsMap[dbTrip.id]) {
      const manifestList = manifestsMap[dbTrip.id];
      checkedIn = manifestList.filter(m => m.attendance === "boarded" || m.attendance === "dropped_off").length;
      total = manifestList.length > 0 ? manifestList.length : total;
    }

    return {
      schedule: sched,
      route,
      dbTrip,
      vehicle,
      driver,
      status: computedStatus,
      checkedIn,
      total
    };
  });

  // Filtered trips list
  const filteredTrips = joinedTrips.filter(t => {
    const matchesSearch = 
      (t.route?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.schedule.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.driver?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.vehicle?.license_plate || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "All" || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Status counters
  const totalCount = joinedTrips.length;
  const activeCount = joinedTrips.filter(t => t.status === "Active").length;
  const completedCount = joinedTrips.filter(t => t.status === "Completed").length;
  const delayedCount = joinedTrips.filter(t => t.status === "Delayed").length;
  const missedCount = joinedTrips.filter(t => t.status === "Missed").length;
  const cancelledCount = joinedTrips.filter(t => t.status === "Cancelled").length;

  const getStatusIcon = (status: string) => {
    const color = tripStatusIconColor(status);
    switch (status) {
      case "Active": return <Activity size={15} style={{ color }} />;
      case "Completed": return <CheckCircle2 size={15} style={{ color }} />;
      case "Delayed": return <Clock size={15} style={{ color }} />;
      case "Missed": return <AlertCircle size={15} style={{ color }} />;
      case "Cancelled": return <XCircle size={15} style={{ color }} />;
      default: return <Clock size={15} style={{ color }} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar />

      <main className="main-content">
        <header className="main-header">
          <div>
            <span className="header-subtitle">Routes</span>
            <h1 className="header-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock size={24} style={{ color: "var(--accent-primary)" }} />
              Today's Trips
            </h1>
          </div>
          <UserProfileBadge />
        </header>

        <div className="content-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Subtitle Date display */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            background: "var(--bg-surface)",
            borderRadius: "12px",
            border: "1px solid var(--border-default)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", color: "var(--text-primary)" }}>
              <Calendar size={18} style={{ color: "var(--accent-primary)" }} />
              <span>Calendar Schedule: <strong>{formattedToday}</strong></span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Operating Day Code: <strong style={{ color: "var(--accent-secondary)" }}>{dbDay} (Sat=6, Sun=7)</strong>
            </div>
          </div>

          {/* Quick Metrics Panels */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
            gap: "14px"
          }}>
            <div className="trips-metric">
              <span className="trips-metric-label">TOTAL RUNS</span>
              <div className="trips-metric-value">{totalCount}</div>
            </div>
            <div className="trips-metric" style={{ borderColor: "rgba(16, 185, 129, 0.25)" }}>
              <span className="trips-metric-label" style={{ color: "var(--accent-primary)" }}>ACTIVE</span>
              <div className="trips-metric-value" style={{ color: "var(--accent-primary)" }}>{activeCount}</div>
            </div>
            <div className="trips-metric" style={{ borderColor: "rgba(59, 130, 246, 0.25)" }}>
              <span className="trips-metric-label" style={{ color: "#3B82F6" }}>COMPLETED</span>
              <div className="trips-metric-value" style={{ color: "#3B82F6" }}>{completedCount}</div>
            </div>
            <div className="trips-metric" style={{ borderColor: "rgba(245, 158, 11, 0.25)" }}>
              <span className="trips-metric-label" style={{ color: "var(--state-warning)" }}>DELAYED</span>
              <div className="trips-metric-value" style={{ color: "var(--state-warning)" }}>{delayedCount}</div>
            </div>
            <div className="trips-metric" style={{ borderColor: "rgba(239, 68, 68, 0.25)" }}>
              <span className="trips-metric-label" style={{ color: "var(--state-error)" }}>MISSED</span>
              <div className="trips-metric-value" style={{ color: "var(--state-error)" }}>{missedCount}</div>
            </div>
            <div className="trips-metric">
              <span className="trips-metric-label">CANCELLED</span>
              <div className="trips-metric-value">{cancelledCount}</div>
            </div>
          </div>

          {/* Controls Bar */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            padding: "16px",
            borderRadius: "12px",
          }}>
            <div style={{ display: "flex", gap: "12px", flex: 1, minWidth: "280px", flexWrap: "wrap" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                background: "var(--input-bg)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "8px 14px",
                gap: "8px",
                flex: 2,
                minWidth: "240px"
              }}>
                <Search size={16} style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search route name, driver, or license plate..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    boxShadow: "none",
                    padding: 0,
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    width: "100%"
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ flex: 1, minWidth: "150px" }}>
                <select
                  className="form-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Missed">Missed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <button
              onClick={fetchData}
              className="btn btn-secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                padding: "8px 16px",
                borderRadius: "12px",
                cursor: "pointer",
                fontWeight: "600",
              }}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? "spin-animation" : ""} />
              Sync Console
            </button>
          </div>

          {/* Trips Table */}
          <div className="table-container" style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "14px",
            padding: "8px",
          }}>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px" }}>
                <RefreshCw size={40} className="spin-animation" style={{ color: "var(--accent-primary)" }} />
                <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Fetching live schedule states...</span>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div style={{ padding: "80px", textAlign: "center", color: "var(--text-muted)" }}>
                <HelpCircle size={48} style={{ opacity: 0.25, marginBottom: "14px", color: "var(--accent-primary)" }} />
                <p style={{ fontSize: "0.95rem" }}>No trips scheduled for today matching your parameters.</p>
              </div>
            ) : (
              <table className="roster-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--border-default)" }}>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Route Name</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Trip Run</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Scheduled</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Bus Plate</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Driver</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Students Checked-in</th>
                    <th style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Status</th>
                    <th style={{ padding: "14px 16px", textAlign: "center", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-muted)" }}>Overrides</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((item, idx) => {
                    const mappedStyles = tripStatusStyles(item.status);
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={item.schedule.id}
                        style={{
                          background: isEven ? "var(--row-hover)" : "transparent",
                          borderBottom: "1px solid var(--border-default)",
                          transition: "background 0.2s ease"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isEven ? "var(--row-hover)" : "transparent"; }}
                      >
                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "600", color: "var(--text-primary)" }}>
                            <Compass size={16} style={{ color: "var(--accent-primary)" }} />
                            {item.route?.name || "Unassigned Route"}
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            {item.schedule.name} • <strong>{tripTypeLabel(item.schedule.direction)}</strong>
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "bold", color: "var(--text-primary)" }}>
                              <Clock size={13} style={{ color: "var(--accent-secondary)" }} />
                              {item.schedule.departure_time.substring(0, 5)}
                            </div>
                            {item.dbTrip?.custom_departure_time && (
                              <span style={{ fontSize: "0.7rem", color: "var(--state-warning)", fontWeight: "600" }}>
                                Delayed to: {item.dbTrip.custom_departure_time}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            <Truck size={14} style={{ color: "var(--accent-primary)" }} />
                            {item.vehicle?.license_plate || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No Bus</span>}
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            <User size={14} style={{ color: "var(--text-muted)" }} />
                            {item.driver?.name || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No Driver Logged In</span>}
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "120px" }}>
                            <div style={{ fontSize: "1.05rem", fontWeight: "bold", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                              <Users size={14} style={{ color: "var(--accent-primary)" }} />
                              <span style={{ color: "var(--accent-primary)" }}>{item.checkedIn}</span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: "normal" }}>/ {item.total}</span>
                            </div>
                            <div style={{ width: "90px", height: "4px", background: "var(--border-default)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{
                                width: `${item.total > 0 ? (item.checkedIn / item.total) * 100 : 0}%`,
                                height: "100%",
                                background: "var(--accent-primary)",
                                borderRadius: "2px",
                                transition: "width 0.4s ease"
                              }} />
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "16px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "bold", ...mappedStyles }}>
                            {getStatusIcon(item.status)}
                            {item.status}
                          </div>
                        </td>

                        <td style={{ padding: "16px", textAlign: "center" }}>
                          {canOverrideTodayTripStatus({
                            displayStatus: item.status,
                            tripStatus: item.dbTrip?.status,
                          }) ? (
                          <button
                            type="button"
                            onClick={() => openUpdateModal(item)}
                            className="btn btn-secondary"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "6px 14px",
                              fontSize: "0.8rem",
                              borderRadius: "12px",
                              fontWeight: "600"
                            }}
                          >
                            <Edit3 size={12} style={{ color: "var(--accent-primary)" }} />
                            Update Status
                          </button>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
        </div>
      </main>

      {/* Override trip modal */}
      {showModal && selectedRun && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(6px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "20px"
        }}>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-xl)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "500px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 24px",
              borderBottom: "1px solid var(--border-default)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Clock size={18} style={{ color: "var(--accent-primary)" }} />
                <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)", margin: 0 }}>Override this trip</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border-default)",
                padding: "14px 16px",
                borderRadius: "12px",
                fontSize: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Trip:</span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedRun.schedule.name} ({tripTypeLabel(selectedRun.schedule.direction)})</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Route:</span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedRun.route?.name || "Unassigned"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Scheduled Depart:</span>
                  <strong style={{ color: "var(--accent-secondary)" }}>{selectedRun.schedule.departure_time.substring(0, 5)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Current Status:</span>
                  <strong style={{ color: "var(--accent-primary)" }}>{selectedRun.status}</strong>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>UPDATE TRIP STATUS</label>
                <select
                  value={modalStatus}
                  onChange={(e) => {
                    setModalStatus(e.target.value);
                    setTimeValidationError("");
                  }}
                  className="form-input"
                >
                  <option value="Scheduled">Scheduled</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Missed">Missed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {modalStatus === "Delayed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }} className="fade-in-animation">
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>NEW SCHEDULED DEPARTURE TIME</label>
                  <input
                    type="time"
                    value={modalNewTime}
                    onChange={(e) => {
                      setModalNewTime(e.target.value);
                      setTimeValidationError("");
                    }}
                    className="form-input"
                  />
                  {timeValidationError && (
                    <span style={{ fontSize: "0.75rem", color: "var(--state-error)", fontWeight: "500", marginTop: "2px" }}>
                      ⚠️ {timeValidationError}
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>DESCRIPTION / REASON TEXT</label>
                <textarea
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="Provide brief details or justification for the override (e.g. Heavy traffic along Westlands, vehicle flat tire, etc.)..."
                  className="form-input"
                  rows={3}
                  style={{ resize: "none", fontSize: "0.85rem" }}
                />
              </div>
            </div>

            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
              padding: "18px 24px",
              borderTop: "1px solid var(--border-default)",
            }}>
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-secondary"
                disabled={isSaving}
                style={{ padding: "8px 18px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModal}
                className="btn btn-primary"
                disabled={isSaving}
                style={{
                  padding: "8px 22px",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="spin-animation" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Save & Broadcast
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

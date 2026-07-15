"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { useAuth } from "@/components/AuthProvider";
import { 
  Settings, 
  School, 
  BellRing, 
  CalendarDays, 
  Save, 
  Sliders, 
  Mail, 
  Phone, 
  MapPin, 
  Image, 
  Plus, 
  Trash2, 
  Info,
  Clock,
  CheckSquare,
  ShieldAlert,
  Key
} from "lucide-react";

interface Holiday {
  label: string;
  startDate: string;
  endDate: string;
}

export default function ConfigConsole() {
  const { profile } = useAuth();

  // Role permissions: Only Super Admin and Operations Admin can edit configurations
  const canEdit = profile?.admin_role === "Super Admin" || profile?.admin_role === "Operations Admin";

  // Tab State
  const [activeTab, setActiveTab] = useState<"profile" | "alerts" | "schedule" | "notifications">("profile");

  // Form State
  const [schoolName, setSchoolName] = useState("");
  const [smsNotificationsEnabled, setSmsNotificationsEnabled] = useState(false);
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [geofenceRadius, setGeofenceRadius] = useState(500);
  const [notifyTripStart, setNotifyTripStart] = useState(true);
  const [notifyGeofenceEntry, setNotifyGeofenceEntry] = useState(true);
  const [notifyBoarded, setNotifyBoarded] = useState(true);
  const [smsTemplateGeofence, setSmsTemplateGeofence] = useState("Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.");
  const [smsTemplateBoarded, setSmsTemplateBoarded] = useState("Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.");
  const [smsTemplateTripStart, setSmsTemplateTripStart] = useState("Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.");
  const [smsTemplateTripStatus, setSmsTemplateTripStatus] = useState("Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.");
  const [mapboxAccessToken, setMapboxAccessToken] = useState("");

  const [operatingHoursStart, setOperatingHoursStart] = useState("06:00");
  const [operatingHoursEnd, setOperatingHoursEnd] = useState("18:00");
  const [operatingDays, setOperatingDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Holiday Add State
  const [newHolidayLabel, setNewHolidayLabel] = useState("");
  const [newHolidayStart, setNewHolidayStart] = useState("");
  const [newHolidayEnd, setNewHolidayEnd] = useState("");

  // Loading & Toast State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Fetch Config
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/config");
        const json = await res.json();
        if (json.success && json.data) {
          const config = json.data;
          setSchoolName(config.school_name || "");
          setSchoolPhone(config.school_phone || "");
          setSchoolEmail(config.school_email || "");
          setSchoolAddress(config.school_address || "");
          setLogoUrl(config.logo_url || "");
          setGeofenceRadius(config.geofence_radius_meters || 500);
          setNotifyTripStart(config.notify_on_trip_start !== false);
          setNotifyGeofenceEntry(config.notify_on_geofence_entry !== false);
          setNotifyBoarded(config.notify_on_boarded !== false);
          setSmsTemplateGeofence(config.sms_template_geofence || "Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}.");
          setSmsTemplateBoarded(config.sms_template_boarded || "Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}.");
          setSmsTemplateTripStart(config.sms_template_trip_start || "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active.");
          setSmsTemplateTripStatus(config.sms_template_trip_status || "Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}.");
          setOperatingHoursStart(config.operating_hours_start?.slice(0, 5) || "06:00");
          setOperatingHoursEnd(config.operating_hours_end?.slice(0, 5) || "18:00");
          setOperatingDays(config.operating_days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
          setHolidays(config.holidays || []);
          setSmsNotificationsEnabled(config.sms_notifications_enabled || false);
          setMapboxAccessToken(config.mapbox_access_token || "");
        }
      } catch (err) {
        console.error("Failed to fetch system configurations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setToast(null);

    const payload = {
      school_name: schoolName,
      school_phone: schoolPhone,
      school_email: schoolEmail,
      school_address: schoolAddress,
      logo_url: logoUrl,
      geofence_radius_meters: geofenceRadius,
      notify_on_trip_start: notifyTripStart,
      notify_on_geofence_entry: notifyGeofenceEntry,
      notify_on_boarded: notifyBoarded,
      sms_template_geofence: smsTemplateGeofence,
      sms_template_boarded: smsTemplateBoarded,
      sms_template_trip_start: smsTemplateTripStart,
      sms_template_trip_status: smsTemplateTripStatus,
      operating_hours_start: operatingHoursStart + ":00",
      operating_hours_end: operatingHoursEnd + ":00",
      operating_days: operatingDays,
      holidays: holidays,
      sms_notifications_enabled: smsNotificationsEnabled,
      mapbox_access_token: mapboxAccessToken
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setToast({ message: "System configurations updated successfully!", type: "success" });
      } else {
        setToast({ message: json.error || "Failed to update configurations", type: "error" });
      }
    } catch (err) {
      console.error("Failed to update config:", err);
      setToast({ message: "An unexpected network error occurred", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleDayToggle = (day: string) => {
    if (!canEdit) return;
    if (operatingDays.includes(day)) {
      setOperatingDays(operatingDays.filter(d => d !== day));
    } else {
      setOperatingDays([...operatingDays, day]);
    }
  };

  const handleAddHoliday = () => {
    if (!canEdit) return;
    if (!newHolidayLabel || !newHolidayStart || !newHolidayEnd) {
      alert("Please fill in all holiday fields before adding.");
      return;
    }
    const updated = [...holidays, { label: newHolidayLabel, startDate: newHolidayStart, endDate: newHolidayEnd }];
    setHolidays(updated);
    setNewHolidayLabel("");
    setNewHolidayStart("");
    setNewHolidayEnd("");
  };

  const handleRemoveHoliday = (index: number) => {
    if (!canEdit) return;
    const updated = holidays.filter((_, idx) => idx !== index);
    setHolidays(updated);
  };

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="app-container">
      <Sidebar />

      {loading ? (
        <main className="main-content" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "calc(100vh - 100px)" }}>
          <div className="spinner" />
        </main>
      ) : (
        <>
          <main className="main-content">
            <header className="top-bar">
              <div>
                <span className="top-bar-title">System Configurations</span>
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
                  Platform Settings
                </span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <UserProfileBadge />
              </div>
            </header>

            {/* Read-Only Restriction Alert */}
            {!canEdit && (
              <div style={{
                margin: "24px 24px 0 24px",
                background: "rgba(244,63,94,0.06)",
                border: "1px solid rgba(244,63,94,0.15)",
                color: "var(--state-error)",
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontWeight: 500
              }}>
                <ShieldAlert size={18} />
                <span>Read-Only Mode: Settings adjustments require Super Admin or Operations Admin privileges.</span>
              </div>
            )}

            {/* Toast Notification */}
            {toast && (
              <div style={{
                position: "fixed",
                bottom: "24px",
                right: "24px",
                background: toast.type === "success" ? "var(--accent-primary)" : "var(--state-error)",
                color: "#ffffff",
                padding: "12px 20px",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                fontSize: "0.9rem",
                fontWeight: 600,
                zIndex: 9999,
                animation: "modal-enter 0.2s ease"
              }}>
                {toast.message}
              </div>
            )}

            <form onSubmit={handleSave} style={{ padding: "24px" }}>
              {/* Tab Navigation Controls */}
              <div className="tab-navigation">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => setActiveTab("profile")}
                >
                  <School size={16} />
                  <span>General Profile</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "alerts" ? "active" : ""}`}
                  onClick={() => setActiveTab("alerts")}
                >
                  <BellRing size={16} />
                  <span>Alerts & Geofencing</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "schedule" ? "active" : ""}`}
                  onClick={() => setActiveTab("schedule")}
                >
                  <CalendarDays size={16} />
                  <span>Operational Hours</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === "notifications" ? "active" : ""}`}
                  onClick={() => setActiveTab("notifications")}
                >
                  <BellRing size={16} />
                  <span>Notifications</span>
                </button>
              </div>

              {/* TAB 1: GENERAL PROFILE */}
              {activeTab === "profile" && (
                <div className="config-panel">
                  <span className="panel-title">School Identity & Contacts</span>
                  <p className="panel-desc">Configure the branding and support details used in external templates and parent applications.</p>
                  
                  <div className="form-grid">
                    <div className="form-group">
                      <label>School Name *</label>
                      <div className="input-with-icon">
                        <School size={16} className="input-icon" />
                        <input
                          type="text"
                          required
                          disabled={!canEdit}
                          value={schoolName}
                          onChange={(e) => setSchoolName(e.target.value)}
                          placeholder="e.g. Safaricom Academy"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>School Phone Number</label>
                      <div className="input-with-icon">
                        <Phone size={16} className="input-icon" />
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={schoolPhone}
                          onChange={(e) => setSchoolPhone(e.target.value)}
                          placeholder="e.g. +254 700 000 000"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Support Email Address</label>
                      <div className="input-with-icon">
                        <Mail size={16} className="input-icon" />
                        <input
                          type="email"
                          disabled={!canEdit}
                          value={schoolEmail}
                          onChange={(e) => setSchoolEmail(e.target.value)}
                          placeholder="e.g. transport@safaricom.edu"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>School Address / HQ Location</label>
                      <div className="input-with-icon">
                        <MapPin size={16} className="input-icon" />
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={schoolAddress}
                          onChange={(e) => setSchoolAddress(e.target.value)}
                          placeholder="e.g. Nairobi, Kenya"
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label>Logo Asset URL</label>
                      <div className="input-with-icon">
                        <Image size={16} className="input-icon" />
                        <input
                          type="url"
                          disabled={!canEdit}
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="e.g. https://logo-server.com/safaricom_academy.png"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ALERTS & GEOFENCING */}
              {activeTab === "alerts" && (
                <div className="config-panel">
                  <span className="panel-title">Geofencing & Alerts Dispatch</span>
                  <p className="panel-desc">Define the operational radius triggers and configure custom message templates sent to parents.</p>

                  <div className="form-group" style={{ marginBottom: "28px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <Key size={16} style={{ color: "var(--accent-primary)" }} />
                      <span>Mapbox Access Token (for Live Traffic ETAs)</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={mapboxAccessToken}
                      onChange={(e) => setMapboxAccessToken(e.target.value)}
                      placeholder="pk.ey..."
                      style={{
                        width: "100%",
                        background: "var(--background-card)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "10px",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                        outline: "none"
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                      Add your Mapbox Public Token to enable live traffic routing matrix calculations. If empty, the system defaults to static stop duration estimates.
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: "28px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Sliders size={16} style={{ color: "var(--accent-primary)" }} />
                        <span>Proximity Trigger Radius</span>
                      </label>
                      <span style={{ color: "var(--accent-primary)", fontWeight: "600", fontSize: "0.85rem" }}>
                        {geofenceRadius} meters
                      </span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="3000"
                      step="50"
                      disabled={!canEdit}
                      value={geofenceRadius}
                      onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent-primary)" }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                      Parents will receive a proximity SMS warning when the school bus is within this distance of their registered stop.
                    </span>
                  </div>

                  <div className="form-grid">
                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label>SMS Template: Proximity Approaching</label>
                      <textarea
                        disabled={!canEdit}
                        rows={3}
                        value={smsTemplateGeofence}
                        onChange={(e) => setSmsTemplateGeofence(e.target.value)}
                        placeholder="Hi {parent_name}, Bus {vehicle_plate} is approaching {stop_name}. Please prepare {student_name}."
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)",
                          fontSize: "0.85rem",
                          outline: "none",
                          fontFamily: "monospace"
                        }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        Variables supported: <code>{"{parent_name}"}</code>, <code>{"{student_name}"}</code>, <code>{"{stop_name}"}</code>, <code>{"{vehicle_plate}"}</code>, <code>{"{duration_mins}"}</code>, <code>{"{eta_time}"}</code>.
                      </span>
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label>SMS Template: Safely Boarded / Arrived</label>
                      <textarea
                        disabled={!canEdit}
                        rows={3}
                        value={smsTemplateBoarded}
                        onChange={(e) => setSmsTemplateBoarded(e.target.value)}
                        placeholder="Hi {parent_name}, {student_name} has safely boarded the school bus {vehicle_plate}."
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)",
                          fontSize: "0.85rem",
                          outline: "none",
                          fontFamily: "monospace"
                        }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        Variables supported: <code>{"{parent_name}"}</code>, <code>{"{student_name}"}</code>, <code>{"{vehicle_plate}"}</code>.
                      </span>
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label>SMS Template: Bus Left School (Trip Start)</label>
                      <textarea
                        disabled={!canEdit}
                        rows={3}
                        value={smsTemplateTripStart}
                        onChange={(e) => setSmsTemplateTripStart(e.target.value)}
                        placeholder="Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} has started. Bus {vehicle_plate} is active."
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)",
                          fontSize: "0.85rem",
                          outline: "none",
                          fontFamily: "monospace"
                        }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        Variables supported: <code>{"{parent_name}"}</code>, <code>{"{student_name}"}</code>, <code>{"{route_name}"}</code>, <code>{"{vehicle_plate}"}</code>, <code>{"{trip_name}"}</code>.
                      </span>
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label>SMS Template: Trip Update (Scheduled / Delayed / Cancelled)</label>
                      <textarea
                        disabled={!canEdit}
                        rows={3}
                        value={smsTemplateTripStatus}
                        onChange={(e) => setSmsTemplateTripStatus(e.target.value)}
                        placeholder="Hi {parent_name}, Bus Schedule Alert: Today's trip {trip_name} for {student_name} is {status_override} due to {trip_description}. Bus {vehicle_plate}."
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)",
                          fontSize: "0.85rem",
                          outline: "none",
                          fontFamily: "monospace"
                        }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                        Variables supported: <code>{"{parent_name}"}</code>, <code>{"{student_name}"}</code>, <code>{"{route_name}"}</code>, <code>{"{vehicle_plate}"}</code>, <code>{"{trip_name}"}</code>, <code>{"{status_override}"}</code>, <code>{"{trip_description}"}</code>, <code>{"{departure_time}"}</code>.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: OPERATIONAL HOURS */}
              {activeTab === "schedule" && (
                <div className="config-panel">
                  <span className="panel-title">Operational Hours & Calendar Holidays</span>
                  <p className="panel-desc">Configure when tracking triggers are active, and add scheduled dates when tracking should be paused.</p>

                  <div className="form-grid" style={{ marginBottom: "24px" }}>
                    <div className="form-group">
                      <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Clock size={16} />
                        <span>Daily Operations Start</span>
                      </label>
                      <input
                        type="time"
                        disabled={!canEdit}
                        value={operatingHoursStart}
                        onChange={(e) => setOperatingHoursStart(e.target.value)}
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)"
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Clock size={16} />
                        <span>Daily Operations End</span>
                      </label>
                      <input
                        type="time"
                        disabled={!canEdit}
                        value={operatingHoursEnd}
                        onChange={(e) => setOperatingHoursEnd(e.target.value)}
                        style={{
                          width: "100%",
                          background: "var(--background-card)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "8px",
                          padding: "10px",
                          color: "var(--text-primary)"
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: "28px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                      <CheckSquare size={16} />
                      <span>Active Operating Days</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {daysOfWeek.map((day) => {
                        const isActive = operatingDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleDayToggle(day)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: "600",
                              cursor: canEdit ? "pointer" : "default",
                              background: isActive ? "var(--accent-primary)" : "var(--background-card)",
                              border: isActive ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
                              color: isActive ? "#ffffff" : "var(--text-muted)",
                              transition: "all 0.2s ease"
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                      <CalendarDays size={16} />
                      <span>Vacation Breaks & Holiday Calendar</span>
                    </label>
                    
                    {/* List Existing Holidays */}
                    {holidays.length === 0 ? (
                      <div style={{
                        padding: "16px",
                        textAlign: "center",
                        background: "rgba(255,255,255,0.01)",
                        border: "1px dashed var(--border-default)",
                        borderRadius: "8px",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                        marginBottom: "16px"
                      }}>
                        No holidays or break dates added yet. Tracking will run on all scheduled active operating days.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                        {holidays.map((h, index) => (
                          <div key={index} style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "var(--background-card)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "8px",
                            padding: "10px 16px"
                          }}>
                            <div>
                              <span style={{ fontWeight: 600, color: "#ffffff", fontSize: "0.85rem" }}>{h.label}</span>
                              <span style={{ marginLeft: "12px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {h.startDate} to {h.endDate}
                              </span>
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleRemoveHoliday(index)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--state-error)",
                                  cursor: "pointer",
                                  padding: "4px"
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add New Holiday Panel */}
                    {canEdit && (
                      <div style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "16px"
                      }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "12px" }}>
                          Add Term Vacation/Holiday Break:
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: "0.72rem" }}>Holiday Label</label>
                            <input
                              type="text"
                              value={newHolidayLabel}
                              onChange={(e) => setNewHolidayLabel(e.target.value)}
                              placeholder="e.g. Mid-Term Break"
                              style={{ width: "100%", background: "var(--background-card)", border: "1px solid var(--border-default)", borderRadius: "6px", padding: "6px 10px", color: "var(--text-primary)", fontSize: "0.8rem" }}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: "0.72rem" }}>Start Date</label>
                            <input
                              type="date"
                              value={newHolidayStart}
                              onChange={(e) => setNewHolidayStart(e.target.value)}
                              style={{ width: "100%", background: "var(--background-card)", border: "1px solid var(--border-default)", borderRadius: "6px", padding: "5px 10px", color: "var(--text-primary)", fontSize: "0.8rem" }}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: "0.72rem" }}>End Date</label>
                            <input
                              type="date"
                              value={newHolidayEnd}
                              onChange={(e) => setNewHolidayEnd(e.target.value)}
                              style={{ width: "100%", background: "var(--background-card)", border: "1px solid var(--border-default)", borderRadius: "6px", padding: "5px 10px", color: "var(--text-primary)", fontSize: "0.8rem" }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleAddHoliday}
                            style={{
                              background: "var(--accent-secondary)",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              padding: "8px 12px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontWeight: "600",
                              fontSize: "0.8rem",
                              height: "33px"
                            }}
                          >
                            <Plus size={14} />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: NOTIFICATIONS */}
              {activeTab === "notifications" && (
                <div className="config-panel">
                  <span className="panel-title">Notification Configurations</span>
                  <p className="panel-desc">Manage in-app real-time alerts and enable external SMS messaging for critical transit events.</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    
                    {/* App Notifications Section (Checkable) */}
                    <div style={{
                      background: "rgba(255, 255, 255, 0.01)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "10px",
                      padding: "20px"
                    }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff", display: "block", marginBottom: "4px" }}>
                        App Push Notifications (In-App & Background)
                      </span>
                      <span style={{ fontSize: "0.80rem", color: "var(--text-muted)", display: "block", marginBottom: "16px" }}>
                        Configure which operational events will trigger push notifications to parents and staff mobile applications.
                      </span>

                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <label className="checkbox-row" style={{ border: notifyTripStart ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)", background: notifyTripStart ? "rgba(16, 185, 129, 0.03)" : "var(--background-card)" }}>
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={notifyTripStart}
                            onChange={(e) => setNotifyTripStart(e.target.checked)}
                          />
                          <div>
                            <span>Trip Starts & Route Activation</span>
                            <p>Notify parents instantly when the driver presses "Start Trip" on the driver console.</p>
                          </div>
                        </label>

                        <label className="checkbox-row" style={{ border: notifyGeofenceEntry ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)", background: notifyGeofenceEntry ? "rgba(16, 185, 129, 0.03)" : "var(--background-card)" }}>
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={notifyGeofenceEntry}
                            onChange={(e) => setNotifyGeofenceEntry(e.target.checked)}
                          />
                          <div>
                            <span>Geofence Proximity Alerts (ETA)</span>
                            <p>Notify parents when the vehicle crosses the distance threshold computed via PostGIS coordinates.</p>
                          </div>
                        </label>

                        <label className="checkbox-row" style={{ border: notifyBoarded ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)", background: notifyBoarded ? "rgba(16, 185, 129, 0.03)" : "var(--background-card)" }}>
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={notifyBoarded}
                            onChange={(e) => setNotifyBoarded(e.target.checked)}
                          />
                          <div>
                            <span>Student Boarding & Dropoff Receipts</span>
                            <p>Notify parents instantly when their child is scanned onto/off the bus by the conductor checklist.</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* SMS Notifications Section (Toggleable) */}
                    <div style={{
                      background: "rgba(255, 255, 255, 0.01)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "10px",
                      padding: "20px"
                    }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff", display: "block", marginBottom: "4px" }}>
                        SMS Dispatch Services
                      </span>
                      <span style={{ fontSize: "0.80rem", color: "var(--text-muted)", display: "block", marginBottom: "16px" }}>
                        Dispatch text alerts to registered parents and staff phone numbers using Africa's Talking API integration.
                      </span>

                      <label className="checkbox-row" style={{ border: smsNotificationsEnabled ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)", background: smsNotificationsEnabled ? "rgba(16, 185, 129, 0.03)" : "var(--background-card)" }}>
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={smsNotificationsEnabled}
                          onChange={(e) => setSmsNotificationsEnabled(e.target.checked)}
                        />
                        <div>
                          <span>Enable Global SMS Notifications</span>
                          <p>When enabled, critical alerts will be enqueued to the SMS dispatcher system. High carrier volume rates may apply.</p>
                        </div>
                      </label>
                    </div>

                  </div>
                </div>
              )}

              {/* SAVE ACTION ROW */}
              {canEdit && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                  <button
                    type="submit"
                    disabled={saving}
                    className="save-submit-btn"
                  >
                    <Save size={18} />
                    <span>{saving ? "Saving Changes..." : "Save Configuration"}</span>
                  </button>
                </div>
              )}
            </form>
          </main>

          <style jsx global>{`
            /* Config Console Specific Styles */
            .config-panel {
              background: #111625;
              border: 1px solid var(--border-default);
              border-radius: 12px;
              padding: 24px;
              margin-top: 16px;
              color: var(--text-primary);
              animation: modal-enter 0.2s ease;
            }

            .panel-title {
              display: block;
              font-size: 1.15rem;
              font-weight: 700;
              color: #ffffff;
              margin-bottom: 4px;
            }

            .panel-desc {
              font-size: 0.85rem;
              color: var(--text-muted);
              margin-bottom: 24px;
            }

            .tab-navigation {
              display: flex;
              gap: 8px;
              border-bottom: 1px solid var(--border-default);
              padding-bottom: 8px;
            }

            .tab-btn {
              background: none;
              border: none;
              color: var(--text-muted);
              padding: 8px 16px;
              font-size: 0.85rem;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              border-radius: 6px;
              transition: all 0.2s ease;
            }

            .tab-btn:hover {
              color: #ffffff;
              background: rgba(255, 255, 255, 0.02);
            }

            .tab-btn.active {
              color: var(--accent-primary);
              background: rgba(16, 185, 129, 0.08);
            }

            .form-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: var(--spacing-md);
            }

            @media (max-width: 768px) {
              .form-grid {
                grid-template-columns: 1fr;
              }
            }

            .form-group {
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-bottom: 16px;
            }

            .form-group label {
              font-size: 0.8rem;
              font-weight: 600;
              color: var(--text-primary);
            }

            .input-with-icon {
              position: relative;
              display: flex;
              align-items: center;
            }

            .input-icon {
              position: absolute;
              left: 12px;
              color: var(--text-muted);
            }

            .input-with-icon input {
              width: 100%;
              background: var(--background-card);
              border: 1px solid var(--border-default);
              border-radius: 8px;
              padding: 10px 12px 10px 38px;
              color: var(--text-primary);
              font-size: 0.85rem;
              outline: none;
              transition: border-color 0.2s ease;
            }

            .input-with-icon input:focus {
              border-color: var(--accent-primary);
            }

            .checkbox-row {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              background: var(--background-card);
              border: 1px solid var(--border-default);
              border-radius: 8px;
              padding: 12px 16px;
              cursor: pointer;
              transition: all 0.2s ease;
            }

            .checkbox-row:hover {
              background: rgba(255,255,255,0.01);
              border-color: rgba(255,255,255,0.1);
            }

            .checkbox-row input[type="checkbox"] {
              width: 16px;
              height: 16px;
              margin-top: 2px;
              accent-color: var(--accent-primary);
              cursor: pointer;
            }

            .checkbox-row span {
              display: block;
              font-size: 0.85rem;
              font-weight: 600;
              color: #ffffff;
            }

            .checkbox-row p {
              font-size: 0.75rem;
              color: var(--text-muted);
              margin-top: 2px;
              line-height: 1.3;
            }

            .save-submit-btn {
              background: var(--accent-primary);
              color: #ffffff;
              border: none;
              border-radius: 8px;
              padding: 12px 24px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              transition: all 0.2s ease;
              font-size: 0.9rem;
              box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
            }

            .save-submit-btn:hover {
              background: #0d9668;
              box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
            }

            .save-submit-btn:disabled {
              background: var(--border-default);
              color: var(--text-muted);
              cursor: not-allowed;
              box-shadow: none;
            }
          `}</style>
        </>
      )}
    </div>
  );
}

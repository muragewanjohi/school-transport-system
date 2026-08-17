"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { 
  User, 
  ArrowLeft,
  Phone, 
  Compass, 
  MapPin,
  Save,
  X
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import HomeLocationMapPicker from "@/components/HomeLocationMapPicker";
import StudentStopAssignmentFields from "@/components/StudentStopAssignmentFields";
import StudentGuardiansFields from "@/components/StudentGuardiansFields";
import {
  defaultDifferentStopIds,
  defaultSameStopId,
  inferStudentStopMode,
  sameStageIds,
  type StudentStopMode,
} from "@/lib/studentStopAssignment";
import {
  validateGuardianEntries,
  type GuardianEntry,
} from "@/lib/studentGuardians";
import { studentApiErrorMessage } from "@/lib/studentRecord";

interface DBRoute {
  id: string;
  name: string;
}

export default function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // Reference Data lists
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [formValues, setFormValues] = useState({
    name: "",
    route_id: "",
    nfc_card_hash: "",
    pickup_stop_id: "",
    dropoff_stop_id: "",
    schedule_ids: [] as string[],
    status: "Present" as "Present" | "Absent",
    grade: "",
    class_name: "",
    address: "Kiambu Road, Nairobi",
    latitude: -1.2185,
    longitude: 36.8335,
  });
  const [formGuardians, setFormGuardians] = useState<GuardianEntry[]>([
    { name: "", phone: "" }
  ]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stopMode, setStopMode] = useState<StudentStopMode>("same");

  useEffect(() => {
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [routesRes, stopsRes, schedulesRes] = await Promise.all([
        fetch("/api/routes"),
        fetch("/api/stops"),
        fetch("/api/schedules")
      ]);
      
      const [routesJson, stopsJson, schedulesJson] = await Promise.all([
        routesRes.json(),
        stopsRes.json(),
        schedulesRes.json()
      ]);

      if (routesJson.success) setRoutes(routesJson.data);
      if (stopsJson.success) setStops(stopsJson.data);
      if (schedulesJson.success) setSchedules(schedulesJson.data);
      
      // Load student details
      const studentRes = await fetch(`/api/students/${id}`);
      const studentJson = await studentRes.json();
      
      if (studentJson.success && studentJson.data) {
        const student = studentJson.data;
        let lat = -1.2185;
        let lng = 36.8335;
        if (student.latitude && student.longitude) {
          lat = student.latitude;
          lng = student.longitude;
        } else if (student.pickup_location) {
          if (typeof student.pickup_location === "string") {
            const clean = student.pickup_location.replace('POINT(', '').replace(')', '').trim();
            const parts = clean.split(' ');
            if (parts.length >= 2) {
              lng = parseFloat(parts[0]) || lng;
              lat = parseFloat(parts[1]) || lat;
            }
          }
        }

        setFormValues({
          name: student.name || "",
          route_id: student.route_id || "",
          nfc_card_hash: student.nfc_card_hash || "",
          pickup_stop_id: student.pickup_stop_id || "",
          dropoff_stop_id: student.dropoff_stop_id || "",
          schedule_ids: student.schedule_ids || [],
          status: student.status || "Present",
          grade: student.grade || "",
          class_name: student.class_name || "",
          address: student.address || "Kiambu Road, Nairobi",
          latitude: lat,
          longitude: lng,
        });
        setStopMode(inferStudentStopMode(student.pickup_stop_id || "", student.dropoff_stop_id || ""));
        setFormGuardians(student.guardians && student.guardians.length > 0 
          ? student.guardians.map((g: GuardianEntry) => ({ name: g.name, phone: g.phone }))
          : [{ name: "", phone: "" }]
        );
      } else {
        setErrorMsg("Failed to retrieve student details.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load student profile details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: name === "latitude" || name === "longitude" ? (parseFloat(value) || 0) : value
    }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleRouteIdChange = (routeId: string) => {
    const routeStops = stops.filter(s => s.route_id === routeId);
    const stageIds =
      stopMode === "same"
        ? sameStageIds(defaultSameStopId(routeStops))
        : defaultDifferentStopIds(routeStops);

    setFormValues(prev => ({
      ...prev,
      route_id: routeId,
      pickup_stop_id: stageIds.pickup_stop_id,
      dropoff_stop_id: stageIds.dropoff_stop_id,
      schedule_ids: []
    }));

    if (formErrors.route_id) {
      setFormErrors(prev => ({ ...prev, route_id: "" }));
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formValues.name.trim()) errors.name = "Student name is required";
    if (!formValues.route_id) errors.route_id = "Please assign a transit route";
    if (!formValues.pickup_stop_id) errors.pickup_stop_id = "Please select a pickup stop";
    if (!formValues.dropoff_stop_id) errors.dropoff_stop_id = "Please select a drop-off stop";
    if (formValues.nfc_card_hash && formValues.nfc_card_hash.trim().length < 4) {
      errors.nfc_card_hash = "NFC Card Hash must be at least 4 characters";
    }

    const guardianError = validateGuardianEntries(formGuardians);
    if (guardianError) {
      errors.guardians = guardianError;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitLoading(true);

    const payload = {
      name: formValues.name,
      route_id: formValues.route_id,
      nfc_card_hash: formValues.nfc_card_hash || null,
      pickup_stop_id: formValues.pickup_stop_id || null,
      dropoff_stop_id: formValues.dropoff_stop_id || null,
      schedule_ids: formValues.schedule_ids,
      status: formValues.status,
      guardians: formGuardians.filter(g => g.name.trim() && g.phone.trim()),
      grade: formValues.grade || null,
      class_name: formValues.class_name || null,
      address: formValues.address || null,
      latitude: formValues.latitude,
      longitude: formValues.longitude,
    };

    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json() as {
        success?: boolean;
        error?: string;
        errors?: Record<string, string[] | undefined>;
      };
      if (json.success) {
        router.push("/students");
      } else {
        alert(`Failed to update student: ${studentApiErrorMessage(json)}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit student update.");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .edit-page-layout {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 960px;
          margin: 0 auto;
          width: 100%;
        }
        .form-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 32px;
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          gap: 24px;
          color: var(--text-primary);
        }
        .form-section-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--accent-secondary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 1px solid var(--border-default);
          padding-bottom: 8px;
          margin-bottom: 16px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
        }
        .form-group {
          margin-bottom: 4px;
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
          background: var(--input-bg);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
        .form-error-text {
          font-size: 0.75rem;
          color: var(--state-error);
        }
        .btn-action {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-action.primary {
          background: linear-gradient(135deg, var(--accent-primary), #059669);
          border: none;
          color: white;
        }
        .btn-action.primary:hover {
          opacity: 0.95;
          transform: translateY(-1px);
        }
        .btn-action.secondary {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
        }
        .btn-action.secondary:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .spinner {
          border: 3.5px solid rgba(255, 255, 255, 0.06);
          border-top: 3.5px solid var(--accent-primary);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          animation: spin 0.8s linear infinite;
          margin-bottom: 12px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button 
              onClick={() => router.push("/students")} 
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
              title="Back to Student Registry"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="top-bar-title">Edit Student Profile</span>
          </div>
          <UserProfileBadge />
        </header>

        <div className="edit-page-layout">
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "300px", color: "var(--text-muted)" }}>
              <div className="spinner"></div>
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Retrieving student profile...</span>
            </div>
          ) : errorMsg ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", color: "var(--state-error)", border: "1px dashed var(--state-error)", borderRadius: "12px", gap: "12px" }}>
              <span>{errorMsg}</span>
              <button className="btn-action secondary" onClick={fetchInitialData}>Try Again</button>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} className="form-card">
              
              {/* SECTION: Personal Details */}
              <div>
                <h3 className="form-section-title">Personal Details</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Student Name *</label>
                    <input
                      type="text"
                      name="name"
                      required
                      className={`form-input ${formErrors.name ? "error" : ""}`}
                      placeholder="e.g. Liam Mwangi"
                      value={formValues.name}
                      onChange={handleInputChange}
                    />
                    {formErrors.name && <span className="form-error-text">{formErrors.name}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">NFC Card Hash signature (Optional)</label>
                    <input
                      type="text"
                      name="nfc_card_hash"
                      className={`form-input ${formErrors.nfc_card_hash ? "error" : ""}`}
                      placeholder="e.g. A1B2C3D4"
                      value={formValues.nfc_card_hash}
                      onChange={handleInputChange}
                    />
                    {formErrors.nfc_card_hash && <span className="form-error-text">{formErrors.nfc_card_hash}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Grade</label>
                    <input
                      type="text"
                      name="grade"
                      className="form-input"
                      placeholder="e.g. Grade 4"
                      value={formValues.grade}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Class Name</label>
                    <input
                      type="text"
                      name="class_name"
                      className="form-input"
                      placeholder="e.g. 4 Blue"
                      value={formValues.class_name}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Attendance Status *</label>
                    <select
                      name="status"
                      className="form-input"
                      value={formValues.status}
                      onChange={handleInputChange}
                    >
                      <option value="Present">Present</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: Home Location & Interactive Mapbox Pin */}
              <HomeLocationMapPicker
                address={formValues.address}
                latitude={formValues.latitude}
                longitude={formValues.longitude}
                onAddressChange={(newAddr) =>
                  setFormValues((prev) => ({ ...prev, address: newAddr }))
                }
                onLocationChange={(lat, lng, newAddr) =>
                  setFormValues((prev) => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    address: newAddr !== undefined ? newAddr : prev.address,
                  }))
                }
              />

              <StudentGuardiansFields
                guardians={formGuardians}
                error={formErrors.guardians}
                onChange={(next) => {
                  setFormGuardians(next);
                  if (formErrors.guardians) {
                    setFormErrors((prev) => ({ ...prev, guardians: "" }));
                  }
                }}
                onError={(message) =>
                  setFormErrors((prev) => ({ ...prev, guardians: message }))
                }
              />

              {/* SECTION: Transit Settings */}
              <div>
                <h3 className="form-section-title">Transit Settings</h3>
                <div className="form-grid" style={{ marginBottom: "16px" }}>
                  <div className="form-group">
                    <label className="form-label">Transit Route Assignment *</label>
                    <select
                      name="route_id"
                      required
                      className={`form-input ${formErrors.route_id ? "error" : ""}`}
                      value={formValues.route_id}
                      onChange={(e) => handleRouteIdChange(e.target.value)}
                    >
                      <option value="">-- Select Transit Route --</option>
                      {routes.map(route => (
                        <option key={route.id} value={route.id}>
                          {route.name}
                        </option>
                      ))}
                    </select>
                    {formErrors.route_id && <span className="form-error-text">{formErrors.route_id}</span>}
                  </div>

                  <StudentStopAssignmentFields
                    routeId={formValues.route_id}
                    stops={stops}
                    mode={stopMode}
                    pickupStopId={formValues.pickup_stop_id}
                    dropoffStopId={formValues.dropoff_stop_id}
                    pickupError={formErrors.pickup_stop_id}
                    dropoffError={formErrors.dropoff_stop_id}
                    onModeChange={(mode) => {
                      setStopMode(mode);
                      if (mode === "same") {
                        setFormValues((prev) => ({
                          ...prev,
                          ...sameStageIds(prev.pickup_stop_id || prev.dropoff_stop_id),
                        }));
                      }
                    }}
                    onSameStageChange={(stopId) => {
                      setFormValues((prev) => ({ ...prev, ...sameStageIds(stopId) }));
                      if (formErrors.pickup_stop_id || formErrors.dropoff_stop_id) {
                        setFormErrors((prev) => ({ ...prev, pickup_stop_id: "", dropoff_stop_id: "" }));
                      }
                    }}
                    onPickupChange={(stopId) => {
                      setFormValues((prev) => ({ ...prev, pickup_stop_id: stopId }));
                      if (formErrors.pickup_stop_id) {
                        setFormErrors((prev) => ({ ...prev, pickup_stop_id: "" }));
                      }
                    }}
                    onDropoffChange={(stopId) => {
                      setFormValues((prev) => ({ ...prev, dropoff_stop_id: stopId }));
                      if (formErrors.dropoff_stop_id) {
                        setFormErrors((prev) => ({ ...prev, dropoff_stop_id: "" }));
                      }
                    }}
                  />
                </div>

                {/* Resolve selected pickup & dropoff IDs for the radio button states */}
                {(() => {
                  const routeSchedules = schedules.filter(s => s.route_id === formValues.route_id);
                  const pickupSchedules = routeSchedules.filter(s => s.direction === "HOME_TO_SCHOOL");
                  const dropoffSchedules = routeSchedules.filter(s => s.direction === "SCHOOL_TO_HOME");

                  const selectedPickupId = formValues.schedule_ids.find(id => pickupSchedules.some(s => s.id === id)) || "";
                  const selectedDropoffId = formValues.schedule_ids.find(id => dropoffSchedules.some(s => s.id === id)) || "";

                  // Helper to update schedule_ids based on pickup/dropoff selections
                  const handlePickupChange = (newPickupId: string) => {
                    const newIds = [newPickupId, selectedDropoffId].filter(Boolean);
                    setFormValues(prev => ({ ...prev, schedule_ids: newIds }));
                  };

                  const handleDropoffChange = (newDropoffId: string) => {
                    const newIds = [selectedPickupId, newDropoffId].filter(Boolean);
                    setFormValues(prev => ({ ...prev, schedule_ids: newIds }));
                  };

                  return (
                    <div className="form-grid">
                      {/* Pick up trip selection */}
                      <div className="form-group">
                        <label className="form-label">Pick up trip</label>
                        <div style={{
                          background: "var(--input-bg)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "6px",
                          padding: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          maxHeight: "150px",
                          overflowY: "auto"
                        }}>
                          {formValues.route_id ? (
                            pickupSchedules.length === 0 ? (
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No pick-up schedules configured.</span>
                            ) : (
                              <>
                                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer" }}>
                                  <input
                                    type="radio"
                                    name="pickup_trip"
                                    checked={selectedPickupId === ""}
                                    onChange={() => handlePickupChange("")}
                                  />
                                  <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>None (No Pick up)</span>
                                </label>
                                {pickupSchedules.map(sched => (
                                  <label key={sched.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer" }}>
                                    <input
                                      type="radio"
                                      name="pickup_trip"
                                      checked={selectedPickupId === sched.id}
                                      onChange={() => handlePickupChange(sched.id)}
                                    />
                                    <div>
                                      <span style={{ fontWeight: 500 }}>{sched.name}</span>
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "6px" }}>({sched.departure_time})</span>
                                    </div>
                                  </label>
                                ))}
                              </>
                            )
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Select a route first.</span>
                          )}
                        </div>
                      </div>

                      {/* Drop off trip selection */}
                      <div className="form-group">
                        <label className="form-label">Drop off trip</label>
                        <div style={{
                          background: "var(--input-bg)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "6px",
                          padding: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          maxHeight: "150px",
                          overflowY: "auto"
                        }}>
                          {formValues.route_id ? (
                            dropoffSchedules.length === 0 ? (
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No drop-off schedules configured.</span>
                            ) : (
                              <>
                                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer" }}>
                                  <input
                                    type="radio"
                                    name="dropoff_trip"
                                    checked={selectedDropoffId === ""}
                                    onChange={() => handleDropoffChange("")}
                                  />
                                  <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>None (No Drop off)</span>
                                </label>
                                {dropoffSchedules.map(sched => (
                                  <label key={sched.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer" }}>
                                    <input
                                      type="radio"
                                      name="dropoff_trip"
                                      checked={selectedDropoffId === sched.id}
                                      onChange={() => handleDropoffChange(sched.id)}
                                    />
                                    <div>
                                      <span style={{ fontWeight: 500 }}>{sched.name}</span>
                                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "6px" }}>({sched.departure_time})</span>
                                    </div>
                                  </label>
                                ))}
                              </>
                            )
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Select a route first.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Form Buttons */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "20px", marginTop: "10px" }}>
                <button 
                  type="button" 
                  className="btn-action secondary" 
                  onClick={() => router.push("/students")}
                  disabled={isSubmitLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-action primary" 
                  disabled={isSubmitLoading}
                >
                  {isSubmitLoading ? "Saving Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

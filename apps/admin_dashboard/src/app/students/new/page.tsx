"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  User, 
  Trash2, 
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

interface DBRoute {
  id: string;
  name: string;
}

interface Guardian {
  name: string;
  phone: string;
}

export default function RegisterStudentPage() {
  const router = useRouter();

  // Reference Data lists
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [existingParents, setExistingParents] = useState<any[]>([]);
  
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
  const [formGuardians, setFormGuardians] = useState<Guardian[]>([
    { name: "", phone: "" }
  ]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [routesRes, stopsRes, schedulesRes, parentsRes] = await Promise.all([
        fetch("/api/routes"),
        fetch("/api/stops"),
        fetch("/api/schedules"),
        fetch("/api/parents")
      ]);
      
      const [routesJson, stopsJson, schedulesJson, parentsJson] = await Promise.all([
        routesRes.json(),
        stopsRes.json(),
        schedulesRes.json(),
        parentsRes.json()
      ]);

      if (routesJson.success) setRoutes(routesJson.data);
      if (stopsJson.success) setStops(stopsJson.data);
      if (schedulesJson.success) setSchedules(schedulesJson.data);
      if (parentsJson.success) setExistingParents(parentsJson.data);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load setup reference data.");
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

  const handleRouteIdChange = (newRouteId: string) => {
    const routeStops = stops.filter(s => s.route_id === newRouteId);
    const defaultPickup = routeStops.find(s => s.stop_type === "PICKUP" || s.stop_type === "BOTH")?.id || routeStops[0]?.id || "";
    const defaultDropoff = routeStops.find(s => s.stop_type === "DROPOFF" || s.stop_type === "BOTH")?.id || routeStops[0]?.id || "";

    const routeSchedules = schedules.filter(s => s.route_id === newRouteId);
    const pickupSched = routeSchedules.find(s => s.direction === "HOME_TO_SCHOOL");
    const dropoffSched = routeSchedules.find(s => s.direction === "SCHOOL_TO_HOME");
    
    const initialScheduleIds: string[] = [];
    if (pickupSched) initialScheduleIds.push(pickupSched.id);
    if (dropoffSched) initialScheduleIds.push(dropoffSched.id);

    setFormValues(prev => ({
      ...prev,
      route_id: newRouteId,
      pickup_stop_id: defaultPickup,
      dropoff_stop_id: defaultDropoff,
      schedule_ids: initialScheduleIds
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

    // Validate guardians
    const guardianErrors: string[] = [];
    formGuardians.forEach((g, idx) => {
      if (!g.name.trim()) {
        guardianErrors.push(`Guardian ${idx + 1} name is required`);
        return;
      }
      const phoneTrimmed = g.phone.trim();
      if (!phoneTrimmed) {
        guardianErrors.push(`Guardian ${idx + 1} phone number is required`);
        return;
      }
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
        guardianErrors.push(`Guardian ${idx + 1} phone number details are required`);
      } else if (!/^\d+$/.test(localPart)) {
        guardianErrors.push(`Guardian ${idx + 1} phone number must consist of digits only`);
      } else if (localPart.length < 7 || localPart.length > 11) {
        guardianErrors.push(`Guardian ${idx + 1} phone number is invalid (must be 7-11 digits)`);
      }
    });

    if (guardianErrors.length > 0) {
      errors.guardians = guardianErrors[0];
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
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        router.push("/students");
      } else {
        let errorMsg = json.error;
        if (!errorMsg && json.errors) {
          errorMsg = Object.entries(json.errors)
            .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
            .join("; ");
        }
        errorMsg = errorMsg || "Unknown validation error";
        alert(`Failed to register student: ${errorMsg}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit student registration.");
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
          background: rgba(12, 17, 34, 0.75);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .form-section-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--accent-secondary);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
          background: rgba(6, 9, 19, 0.6);
          border: 1px solid var(--border-default);
          border-radius: 6px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s ease;
        }
        .form-input:focus {
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
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
            <span className="top-bar-title">Register New Student</span>
          </div>
          <UserProfileBadge />
        </header>

        <div className="edit-page-layout">
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "300px", color: "var(--text-muted)" }}>
              <div className="spinner"></div>
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Initializing form metadata...</span>
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

              {/* SECTION: Parents & Guardians */}
              <div>
                <h3 className="form-section-title">Parents & Guardians</h3>
                
                {existingParents.length > 0 && (
                  <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-default)", borderRadius: "8px" }}>
                    <label className="form-label" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "6px", display: "block" }}>
                      Quick Search & Add Existing Parent Profile
                    </label>
                    <select
                      className="form-input"
                      style={{ background: "var(--bg-base)" }}
                      value=""
                      onChange={(e) => {
                        const parentId = e.target.value;
                        if (!parentId) return;
                        const parent = existingParents.find(p => p.id === parentId);
                        if (parent) {
                          const updated = [...formGuardians];
                          // Find first empty row
                          const emptyIdx = updated.findIndex(g => !g.name.trim() && !g.phone.trim());
                          if (emptyIdx !== -1) {
                            updated[emptyIdx] = { name: parent.name, phone: parent.phone };
                          } else if (updated.length < 3) {
                            updated.push({ name: parent.name, phone: parent.phone });
                          } else {
                            alert("Maximum of 3 guardians allowed.");
                          }
                          setFormGuardians(updated);
                        }
                      }}
                    >
                      <option value="">-- Choose registered parent to auto-fill --</option>
                      {existingParents.map(parent => (
                        <option key={parent.id} value={parent.id}>
                          {parent.name} ({parent.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formErrors.guardians && <span className="form-error-text" style={{ marginBottom: "12px", display: "block" }}>{formErrors.guardians}</span>}
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {formGuardians.map((guardian, index) => (
                    <div key={index} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div style={{ flex: 1, display: "flex", gap: "10px" }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder="Guardian Name"
                          value={guardian.name}
                          onChange={(e) => {
                            const updated = [...formGuardians];
                            updated[index].name = e.target.value;
                            setFormGuardians(updated);
                          }}
                          required
                        />
                        <div style={{ display: "flex", gap: "8px", flex: 1 }}>
                          <select
                            value={(() => {
                              const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                              for (const code of codes) {
                                if (guardian.phone.startsWith(code)) return code;
                              }
                              return "+254";
                            })()}
                            onChange={(e) => {
                              const newCode = e.target.value;
                              const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                              let currentLocal = guardian.phone;
                              for (const code of codes) {
                                if (guardian.phone.startsWith(code)) {
                                  currentLocal = guardian.phone.substring(code.length);
                                  break;
                                }
                              }
                              if (currentLocal.startsWith("0")) currentLocal = currentLocal.substring(1);
                              const updated = [...formGuardians];
                              updated[index].phone = newCode + currentLocal;
                              setFormGuardians(updated);
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
                            className="form-input"
                            style={{ flex: 1 }}
                            placeholder="Phone Number"
                            value={(() => {
                              const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                              for (const code of codes) {
                                if (guardian.phone.startsWith(code)) {
                                  return guardian.phone.substring(code.length);
                                }
                              }
                              return guardian.phone;
                            })()}
                            onChange={(e) => {
                              const codes = ["+254", "+256", "+255", "+250", "+1", "+44"];
                              let currentCode = "+254";
                              for (const code of codes) {
                                if (guardian.phone.startsWith(code)) {
                                  currentCode = code;
                                  break;
                                }
                              }
                              let val = e.target.value.replace(/[\s\-()]+/g, "");
                              if (val.startsWith("0")) val = val.substring(1);
                              const updated = [...formGuardians];
                              updated[index].phone = currentCode + val;
                              setFormGuardians(updated);
                            }}
                            required
                          />
                        </div>
                      </div>
                      {formGuardians.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormGuardians(formGuardians.filter((_, i) => i !== index))}
                          style={{
                            background: "rgba(244,63,94,0.06)",
                            border: "1px solid rgba(244,63,94,0.2)",
                            color: "var(--state-error)",
                            padding: "10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Remove Guardian Row"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {formGuardians.length < 3 && (
                    <button
                      type="button"
                      onClick={() => setFormGuardians([...formGuardians, { name: "", phone: "" }])}
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        alignSelf: "flex-start",
                        marginTop: "4px"
                      }}
                    >
                      + Add Guardian Profile
                    </button>
                  )}
                </div>
              </div>

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

                  <div className="form-group">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div className="form-group">
                        <label className="form-label">Pickup Location *</label>
                        <select
                          name="pickup_stop_id"
                          className="form-input"
                          value={formValues.pickup_stop_id}
                          onChange={handleInputChange}
                          disabled={!formValues.route_id}
                        >
                          {!formValues.route_id && <option value="">-- Assign route --</option>}
                          {stops.filter(s => s.route_id === formValues.route_id).map(stop => (
                            <option key={stop.id} value={stop.id}>
                              {stop.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Drop-off Location *</label>
                        <select
                          name="dropoff_stop_id"
                          className="form-input"
                          value={formValues.dropoff_stop_id}
                          onChange={handleInputChange}
                          disabled={!formValues.route_id}
                        >
                          {!formValues.route_id && <option value="">-- Assign route --</option>}
                          {stops.filter(s => s.route_id === formValues.route_id).map(stop => (
                            <option key={stop.id} value={stop.id}>
                              {stop.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
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
                          background: "rgba(6, 9, 19, 0.6)",
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
                          background: "rgba(6, 9, 19, 0.6)",
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
                  {isSubmitLoading ? "Registering Student..." : "Register Student"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

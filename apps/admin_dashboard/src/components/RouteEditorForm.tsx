"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Compass, Save } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import HomeLocationMapPicker from "@/components/HomeLocationMapPicker";

const NAIROBI_LAT = -1.2921;
const NAIROBI_LNG = 36.8219;

interface RouteStopLocation {
  name: string;
  latitude: number;
  longitude: number;
}

interface RouteEditorFormProps {
  mode: "create" | "edit";
  routeId?: string;
}

interface ApiStop {
  id: string;
  route_id: string;
  name: string;
  sequence_no: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  } | null;
}

function parseStopPoint(stop: ApiStop | undefined): { lat: number; lng: number } | null {
  const coords = stop?.location?.coordinates;
  if (!coords || coords.length < 2) return null;
  return { lng: coords[0], lat: coords[1] };
}

export default function RouteEditorForm({ mode, routeId }: RouteEditorFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [routeName, setRouteName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [latitude, setLatitude] = useState(NAIROBI_LAT);
  const [longitude, setLongitude] = useState(NAIROBI_LNG);

  useEffect(() => {
    if (mode !== "edit" || !routeId) return;

    const load = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const [routesRes, stopsRes] = await Promise.all([
          fetch("/api/routes"),
          fetch("/api/stops"),
        ]);
        const routesJson = (await routesRes.json()) as {
          success?: boolean;
          data?: Array<{ id: string; name: string }>;
        };
        const stopsJson = (await stopsRes.json()) as { success?: boolean; data?: ApiStop[] };

        const route = routesJson.data?.find((r) => r.id === routeId);
        if (!route) {
          setErrorMsg("Route not found.");
          return;
        }
        setRouteName(route.name);

        const stops = [...(stopsJson.data ?? [])]
          .filter((s) => s.route_id === routeId)
          .sort((a, b) => a.sequence_no - b.sequence_no);
        const first = stops[0];
        const point = parseStopPoint(first);
        if (first) {
          setSchoolName(first.name);
          setSearchLocation(first.name);
        }
        if (point) {
          setLatitude(point.lat);
          setLongitude(point.lng);
        }
      } catch {
        setErrorMsg("Failed to load route details.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [mode, routeId]);

  const schoolPayload = (): RouteStopLocation => ({
    name: (schoolName.trim() || searchLocation.trim() || routeName.trim()),
    latitude,
    longitude,
  });

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (routeName.trim().length < 2) errors.routeName = "Route name must be at least 2 characters";
    const locName = schoolName.trim() || searchLocation.trim();
    if (locName.length < 2) errors.schoolName = "School location name is required";
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      errors.location = "Pick a location on the map";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitLoading(true);
    setErrorMsg(null);

    const school = schoolPayload();
    try {
      if (mode === "create") {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: routeName.trim(),
            schoolStart: school,
            schoolEnd: school,
          }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string; errors?: Record<string, string[]> };
        if (!json.success) {
          setErrorMsg(json.error || "Failed to create route");
          return;
        }
      } else if (routeId) {
        const res = await fetch(`/api/routes/${routeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: routeName.trim(),
            schoolStart: school,
            schoolEnd: school,
          }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!json.success) {
          setErrorMsg(json.error || "Failed to update route");
          return;
        }
      }
      router.push("/routes");
    } catch {
      setErrorMsg(mode === "create" ? "Failed to create route." : "Failed to update route.");
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
        }
        .btn-action.primary {
          background: var(--accent-primary);
          border: none;
          color: white;
        }
        .btn-action.secondary {
          background: transparent;
          border: 1px solid var(--border-default);
          color: var(--text-primary);
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => router.push("/routes")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
              title="Back to routes"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="top-bar-title">
              {mode === "create" ? "Add Route" : "Edit Route"}
            </span>
          </div>
          <UserProfileBadge />
        </header>

        <div className="edit-page-layout">
          {isLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading route…</p>
          ) : (
            <form className="form-card" onSubmit={handleSubmit}>
              {errorMsg && (
                <p className="form-error-text" role="alert">
                  {errorMsg}
                </p>
              )}

              <div>
                <h3 className="form-section-title">
                  <Compass size={16} style={{ display: "inline", marginRight: 8 }} />
                  Route details
                </h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="route-name">
                    Route name *
                  </label>
                  <input
                    id="route-name"
                    className="form-input"
                    value={routeName}
                    onChange={(e) => setRouteName(e.target.value)}
                    placeholder="e.g. Morning Route 1 (Kileleshwa)"
                    required
                  />
                  {formErrors.routeName && (
                    <span className="form-error-text">{formErrors.routeName}</span>
                  )}
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="school-name">
                    School location name *
                  </label>
                  <input
                    id="school-name"
                    className="form-input"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="e.g. St. Mary's Academy"
                    required
                  />
                  {formErrors.schoolName && (
                    <span className="form-error-text">{formErrors.schoolName}</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="form-section-title">Map location</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 12 }}>
                  Search a place, then click or drag the pin to set the exact coordinates.
                </p>
                <HomeLocationMapPicker
                  address={searchLocation}
                  latitude={latitude}
                  longitude={longitude}
                  searchLabel="Search location"
                  searchPlaceholder="Search Google Maps for a school or landmark…"
                  searchRequired={false}
                  onAddressChange={(addr) => {
                    setSearchLocation(addr);
                    if (!schoolName.trim()) setSchoolName(addr);
                  }}
                  onLocationChange={(lat, lng, addr) => {
                    setLatitude(lat);
                    setLongitude(lng);
                    if (addr) {
                      setSearchLocation(addr);
                      if (!schoolName.trim()) setSchoolName(addr);
                    }
                  }}
                />
                {formErrors.location && (
                  <span className="form-error-text">{formErrors.location}</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-action secondary"
                  onClick={() => router.push("/routes")}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-action primary" disabled={isSubmitLoading}>
                  <Save size={16} />
                  {isSubmitLoading
                    ? mode === "create"
                      ? "Creating…"
                      : "Saving…"
                    : mode === "create"
                      ? "Create Route"
                      : "Save Route"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

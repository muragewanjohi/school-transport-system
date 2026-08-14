"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleAlert, MapPin, Save } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import HomeLocationMapPicker from "@/components/HomeLocationMapPicker";
import { friendlyStopSaveError, stopsPageAfterSave } from "@/lib/stopEditorNavigation";

const NAIROBI_LAT = -1.2921;
const NAIROBI_LNG = 36.8219;

type StopType = "PICKUP" | "DROPOFF" | "BOTH";

interface StopEditorFormProps {
  mode: "create" | "edit";
  stopId?: string;
}

interface ApiRoute {
  id: string;
  name: string;
}

interface ApiStop {
  id: string;
  route_id: string;
  name: string;
  sequence_no: number;
  geofence_radius_meters: number;
  stop_type: StopType;
  location: {
    type: "Point";
    coordinates: [number, number];
  } | null;
}

function safeReturnTo(raw: string | null): string {
  if (raw === "/routes" || raw === "/routes/stops") return raw;
  return "/routes/stops";
}

function parseStopPoint(stop: ApiStop | undefined): { lat: number; lng: number } | null {
  const coords = stop?.location?.coordinates;
  if (!coords || coords.length < 2) return null;
  return { lng: coords[0], lat: coords[1] };
}

function nextSequenceForRoute(stops: ApiStop[], routeId: string): number {
  const routeStops = stops.filter((s) => s.route_id === routeId);
  if (routeStops.length === 0) return 1;
  return Math.max(...routeStops.map((s) => s.sequence_no)) + 1;
}

export default function StopEditorForm({ mode, stopId }: StopEditorFormProps) {
  return (
    <Suspense
      fallback={
        <div className="app-container">
          <Sidebar />
          <main className="main-content">
            <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading stop editor…</p>
          </main>
        </div>
      }
    >
      <StopEditorFormInner mode={mode} stopId={stopId} />
    </Suspense>
  );
}

function StopEditorFormInner({ mode, stopId }: StopEditorFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("return"));
  const presetRouteId = searchParams.get("route_id") ?? "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [routes, setRoutes] = useState<ApiRoute[]>([]);
  const [allStops, setAllStops] = useState<ApiStop[]>([]);

  const [routeId, setRouteId] = useState(presetRouteId);
  const [name, setName] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [latitude, setLatitude] = useState(NAIROBI_LAT);
  const [longitude, setLongitude] = useState(NAIROBI_LNG);
  const [sequenceNo, setSequenceNo] = useState(1);
  const [geofenceRadius, setGeofenceRadius] = useState(50);
  const [stopType, setStopType] = useState<StopType>("BOTH");

  useEffect(() => {
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
          data?: ApiRoute[];
        };
        const stopsJson = (await stopsRes.json()) as { success?: boolean; data?: ApiStop[] };
        const loadedRoutes = routesJson.data ?? [];
        const loadedStops = stopsJson.data ?? [];
        setRoutes(loadedRoutes);
        setAllStops(loadedStops);

        if (mode === "edit") {
          const stop = loadedStops.find((s) => s.id === stopId);
          if (!stop) {
            setErrorMsg("Stop not found.");
            return;
          }
          setRouteId(stop.route_id);
          setName(stop.name);
          setSearchLocation(stop.name);
          setSequenceNo(stop.sequence_no);
          setGeofenceRadius(stop.geofence_radius_meters);
          setStopType(stop.stop_type);
          const point = parseStopPoint(stop);
          if (point) {
            setLatitude(point.lat);
            setLongitude(point.lng);
          }
        } else {
          const initialRoute = presetRouteId || loadedRoutes[0]?.id || "";
          setRouteId(initialRoute);
          if (initialRoute) {
            setSequenceNo(nextSequenceForRoute(loadedStops, initialRoute));
          }
        }
      } catch {
        setErrorMsg("Failed to load stop details.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [mode, stopId, presetRouteId]);

  const handleRouteChange = (nextRouteId: string) => {
    setRouteId(nextRouteId);
    if (mode === "create" && nextRouteId) {
      setSequenceNo(nextSequenceForRoute(allStops, nextRouteId));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!routeId) errors.routeId = "Route selection is required";
    if (name.trim().length < 2) errors.name = "Stop name must be at least 2 characters";
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.location = "Pick a valid location on the map";
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.location = "Pick a valid location on the map";
    }
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      errors.sequenceNo = "Sequence number must be 1 or greater";
    }
    if (!Number.isFinite(geofenceRadius) || geofenceRadius < 5) {
      errors.geofenceRadius = "Geofence radius must be at least 5 meters";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitLoading(true);
    setErrorMsg(null);

    const payload = {
      route_id: routeId,
      name: name.trim(),
      latitude,
      longitude,
      sequence_no: sequenceNo,
      geofence_radius_meters: geofenceRadius,
      stop_type: stopType,
    };

    try {
      if (mode === "create") {
        const res = await fetch("/api/stops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          errors?: Record<string, string[]>;
        };
        if (!json.success) {
          setErrorMsg(
            friendlyStopSaveError(json.error || json.errors?.name?.[0] || "Failed to create stop"),
          );
          setIsSubmitLoading(false);
          return;
        }
        router.push(stopsPageAfterSave("created"));
        return;
      }

      if (stopId) {
        const res = await fetch(`/api/stops/${stopId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!json.success) {
          setErrorMsg(friendlyStopSaveError(json.error || "Failed to update stop"));
          setIsSubmitLoading(false);
          return;
        }
        router.push(stopsPageAfterSave("updated"));
        return;
      }

      setIsSubmitLoading(false);
    } catch {
      setErrorMsg(mode === "create" ? "Failed to create stop." : "Failed to update stop.");
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
        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .error-dialog-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(6px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          padding: 20px;
        }
        .error-dialog {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          box-shadow: var(--shadow-xl);
          border-radius: 16px;
          width: 100%;
          max-width: 440px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .error-dialog-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .error-dialog-title svg {
          color: var(--state-error-ink);
          flex-shrink: 0;
        }
        .error-dialog-body {
          margin: 0;
          color: var(--text-primary);
          font-size: 0.92rem;
          line-height: 1.45;
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="top-bar-title">
              {mode === "create" ? "Add Route Stop" : "Edit Route Stop"}
            </span>
          </div>
          <UserProfileBadge />
        </header>

        <div className="edit-page-layout">
          {isLoading ? (
            <p style={{ color: "var(--text-muted)" }}>Loading stop…</p>
          ) : (
            <form className="form-card" onSubmit={handleSubmit}>
              <div>
                <h3 className="form-section-title">
                  <MapPin size={16} style={{ display: "inline", marginRight: 8 }} />
                  Stop details
                </h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="stop-route">
                    Route *
                  </label>
                  <select
                    id="stop-route"
                    className="form-input"
                    value={routeId}
                    onChange={(e) => handleRouteChange(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      -- Select Route --
                    </option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.routeId && (
                    <span className="form-error-text">{formErrors.routeId}</span>
                  )}
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="stop-name">
                    Stop name *
                  </label>
                  <input
                    id="stop-name"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Stop Riverside"
                    required
                  />
                  {formErrors.name && (
                    <span className="form-error-text">{formErrors.name}</span>
                  )}
                </div>
                <div className="form-grid-2" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="stop-sequence">
                      Sequence no *
                    </label>
                    <input
                      id="stop-sequence"
                      className="form-input"
                      type="number"
                      min={1}
                      value={sequenceNo}
                      onChange={(e) => setSequenceNo(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                    {formErrors.sequenceNo && (
                      <span className="form-error-text">{formErrors.sequenceNo}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="stop-geofence">
                      Geofence radius (meters) *
                    </label>
                    <input
                      id="stop-geofence"
                      className="form-input"
                      type="number"
                      min={5}
                      value={geofenceRadius}
                      onChange={(e) => setGeofenceRadius(parseInt(e.target.value, 10) || 0)}
                      required
                    />
                    {formErrors.geofenceRadius && (
                      <span className="form-error-text">{formErrors.geofenceRadius}</span>
                    )}
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="stop-type">
                    Stop type *
                  </label>
                  <select
                    id="stop-type"
                    className="form-input"
                    value={stopType}
                    onChange={(e) => setStopType(e.target.value as StopType)}
                    required
                  >
                    <option value="BOTH">BOTH (Pickup and Dropoff)</option>
                    <option value="PICKUP">PICKUP Only</option>
                    <option value="DROPOFF">DROPOFF Only</option>
                  </select>
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
                  searchPlaceholder="Search Google Maps for a stop or landmark…"
                  searchRequired={false}
                  onAddressChange={(addr) => {
                    setSearchLocation(addr);
                    if (!name.trim()) setName(addr);
                  }}
                  onLocationChange={(lat, lng, addr) => {
                    setLatitude(lat);
                    setLongitude(lng);
                    if (addr) {
                      setSearchLocation(addr);
                      if (!name.trim()) setName(addr);
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
                  onClick={() => router.push(returnTo)}
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
                      ? "Create Route Stop"
                      : "Update Route Stop"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {errorMsg && (
        <div className="error-dialog-backdrop" onClick={() => setErrorMsg(null)}>
          <div
            className="error-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="stop-save-error-title"
            aria-describedby="stop-save-error-body"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="stop-save-error-title" className="error-dialog-title">
              <CircleAlert size={22} />
              Could not save stop
            </h2>
            <p id="stop-save-error-body" className="error-dialog-body">
              {errorMsg}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-action primary"
                onClick={() => setErrorMsg(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

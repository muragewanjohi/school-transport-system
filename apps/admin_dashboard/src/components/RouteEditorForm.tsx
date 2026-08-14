"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Compass, MapPin, Save } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import HomeLocationMapPicker from "@/components/HomeLocationMapPicker";
import {
  defaultSchoolId,
  inferEndpointFromStop,
  isMapVisible,
  mergeSchoolOptions,
  needsSchoolDropdown,
  parseLocalSchoolLocations,
  resolveEndpointPayload,
  type EndpointDraft,
  type LocationSource,
  type SchoolOption,
} from "@/lib/routeEndpointSelection";

const NAIROBI_LAT = -1.2921;
const NAIROBI_LNG = 36.8219;

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

function emptyEndpoint(schoolId: string): EndpointDraft {
  return {
    source: "school",
    schoolId,
    searchLocation: "",
    latitude: NAIROBI_LAT,
    longitude: NAIROBI_LNG,
  };
}

export default function RouteEditorForm({ mode, routeId }: RouteEditorFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [routeName, setRouteName] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [start, setStart] = useState<EndpointDraft>(emptyEndpoint(""));
  const [end, setEnd] = useState<EndpointDraft>(emptyEndpoint(""));

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const [campusRes, configRes] = await Promise.all([
          fetch("/api/campuses"),
          fetch("/api/config"),
        ]);
        const campusJson = (await campusRes.json()) as { success?: boolean; data?: SchoolOption[] };
        const configJson = (await configRes.json()) as {
          success?: boolean;
          data?: { school_name?: string };
        };

        const fromApi = campusJson.success ? campusJson.data ?? [] : [];
        const fromLocal = parseLocalSchoolLocations(
          typeof window !== "undefined" ? localStorage.getItem("safaricom_school_locations") : null,
        );
        let nextSchools = mergeSchoolOptions(fromApi, fromLocal);
        if (nextSchools.length === 0) {
          const configName = configJson.data?.school_name?.trim();
          nextSchools = [
            {
              id: "config-school",
              name: configName && configName.length >= 2 ? configName : "School",
              latitude: NAIROBI_LAT,
              longitude: NAIROBI_LNG,
            },
          ];
        }
        setSchools(nextSchools);
        const autoId = defaultSchoolId(nextSchools);
        let nextStart = emptyEndpoint(autoId);
        let nextEnd = emptyEndpoint(autoId);

        if (mode === "edit" && routeId) {
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
          const last = stops[stops.length - 1];
          const firstPoint = parseStopPoint(first);
          const lastPoint = parseStopPoint(last);
          nextStart = inferEndpointFromStop(
            first && firstPoint
              ? { name: first.name, latitude: firstPoint.lat, longitude: firstPoint.lng }
              : null,
            nextSchools,
            nextStart,
          );
          nextEnd = inferEndpointFromStop(
            last && lastPoint
              ? { name: last.name, latitude: lastPoint.lat, longitude: lastPoint.lng }
              : null,
            nextSchools,
            nextEnd,
          );
        }

        setStart(nextStart);
        setEnd(nextEnd);
      } catch {
        setErrorMsg(mode === "edit" ? "Failed to load route details." : "Failed to load school locations.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [mode, routeId]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (routeName.trim().length < 2) errors.routeName = "Route name must be at least 2 characters";
    const startResult = resolveEndpointPayload(start, schools, "Start location");
    const endResult = resolveEndpointPayload(end, schools, "End location");
    if (!startResult.ok) errors.start = startResult.error;
    if (!endResult.ok) errors.end = endResult.error;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const startResult = resolveEndpointPayload(start, schools, "Start location");
    const endResult = resolveEndpointPayload(end, schools, "End location");
    if (!startResult.ok || !endResult.ok) return;

    setIsSubmitLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "create") {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: routeName.trim(),
            schoolStart: startResult.value,
            schoolEnd: endResult.value,
          }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!json.success) {
          setErrorMsg(json.error || "Failed to create route");
          setIsSubmitLoading(false);
          return;
        }
      } else if (routeId) {
        const res = await fetch(`/api/routes/${routeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: routeName.trim(),
            schoolStart: startResult.value,
            schoolEnd: endResult.value,
          }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!json.success) {
          setErrorMsg(json.error || "Failed to update route");
          setIsSubmitLoading(false);
          return;
        }
      }
      router.push("/routes");
    } catch {
      setErrorMsg(mode === "create" ? "Failed to create route." : "Failed to update route.");
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
        .form-hint-text {
          font-size: 0.85rem;
          color: var(--text-muted);
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
        .location-source-toggle {
          display: flex;
          gap: 8px;
        }
        .location-source-toggle button {
          flex: 1;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border-default);
          background: var(--input-bg);
          color: var(--text-primary);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        }
        .location-source-toggle button.active {
          border-color: var(--accent-primary);
          background: rgba(4, 120, 87, 0.12);
          color: var(--accent-primary-ink);
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
              </div>

              <RouteEndpointFields
                heading="Start location"
                schoolSelectId="start-school"
                endpoint={start}
                schools={schools}
                error={formErrors.start}
                fallbackName="Start location"
                onChange={setStart}
              />

              <RouteEndpointFields
                heading="End location"
                schoolSelectId="end-school"
                endpoint={end}
                schools={schools}
                error={formErrors.end}
                fallbackName="End location"
                onChange={setEnd}
              />

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

function RouteEndpointFields({
  heading,
  schoolSelectId,
  endpoint,
  schools,
  error,
  fallbackName,
  onChange,
}: {
  heading: string;
  schoolSelectId: string;
  endpoint: EndpointDraft;
  schools: SchoolOption[];
  error?: string;
  fallbackName: string;
  onChange: (next: EndpointDraft) => void;
}) {
  const showDropdown = needsSchoolDropdown(schools);
  const showMap = isMapVisible(endpoint.source);
  const selectedSchool = schools.find((school) => school.id === endpoint.schoolId) ?? schools[0];

  const setSource = (source: LocationSource) => {
    if (source === "school" && selectedSchool) {
      onChange({
        ...endpoint,
        source,
        schoolId: endpoint.schoolId || selectedSchool.id,
        searchLocation: selectedSchool.name,
        latitude: selectedSchool.latitude,
        longitude: selectedSchool.longitude,
      });
      return;
    }
    onChange({ ...endpoint, source });
  };

  return (
    <div>
      <h3 className="form-section-title">
        <MapPin size={16} style={{ display: "inline", marginRight: 8 }} />
        {heading} *
      </h3>
      <div className="form-group">
        <div className="location-source-toggle" role="radiogroup" aria-label={`${heading} source`}>
          <button
            type="button"
            role="radio"
            aria-checked={endpoint.source === "school"}
            className={endpoint.source === "school" ? "active" : ""}
            onClick={() => setSource("school")}
          >
            From school
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={endpoint.source === "custom"}
            className={endpoint.source === "custom" ? "active" : ""}
            onClick={() => setSource("custom")}
          >
            Choose location
          </button>
        </div>
      </div>

      {endpoint.source === "school" && showDropdown && (
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor={schoolSelectId}>
            School *
          </label>
          <select
            id={schoolSelectId}
            className="form-input"
            value={endpoint.schoolId}
            onChange={(e) => onChange({ ...endpoint, schoolId: e.target.value })}
            required
          >
            <option value="" disabled>
              -- Select school --
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {endpoint.source === "school" && !showDropdown && selectedSchool && (
        <p className="form-hint-text" style={{ marginTop: 12 }}>
          Using {selectedSchool.name}
        </p>
      )}

      {endpoint.source === "school" && schools.length === 0 && (
        <span className="form-error-text">No school location is configured.</span>
      )}

      {showMap && (
        <div style={{ marginTop: 16 }}>
          <p className="form-hint-text" style={{ marginBottom: 12 }}>
            Search a place, then click or drag the pin. That point becomes the {fallbackName.toLowerCase()}.
          </p>
          <HomeLocationMapPicker
            address={endpoint.searchLocation}
            latitude={endpoint.latitude}
            longitude={endpoint.longitude}
            searchLabel="Search location"
            searchPlaceholder="Search Google Maps for a landmark…"
            searchRequired={false}
            onAddressChange={(addr) => onChange({ ...endpoint, searchLocation: addr })}
            onLocationChange={(lat, lng, addr) =>
              onChange({
                ...endpoint,
                latitude: lat,
                longitude: lng,
                searchLocation: addr || endpoint.searchLocation,
              })
            }
          />
        </div>
      )}

      {error && (
        <span className="form-error-text" style={{ marginTop: 8 }}>
          {error}
        </span>
      )}
    </div>
  );
}

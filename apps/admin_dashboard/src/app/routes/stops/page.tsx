"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  MapPin, 
  Plus, 
  Trash2, 
  Edit, 
  Compass, 
  Search, 
  SlidersHorizontal,
  Navigation,
  Globe,
  Radio,
  Eye,
  CheckCircle2
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { noticeFromStopsSearch, STOPS_STAGES_PATH } from "@/lib/stopEditorNavigation";

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
  const router = useRouter();
  const [stops, setStops] = useState<DBStop[]>([]);
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [notice, setNotice] = useState<string | null>(null);

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

  useEffect(() => {
    const message = noticeFromStopsSearch(window.location.search);
    if (!message) return;
    setNotice(message);
    router.replace(STOPS_STAGES_PATH, { scroll: false });
  }, [router]);

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
          {notice && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "rgba(4, 120, 87, 0.12)",
                border: "1px solid rgba(4, 120, 87, 0.35)",
                color: "var(--accent-primary-ink)",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {/* Controls Bar */}
          <div className="stops-toolbar">
            <div className="stops-toolbar-filters">
              <div className="stops-toolbar-search">
                <Search size={16} className="stops-toolbar-search-icon" />
                <input
                  type="text"
                  placeholder="Search by stop or route name..."
                  className="form-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="form-input stops-toolbar-route"
                aria-label="Filter by route"
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
              >
                <option value="All">All Routes</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <select
                className="form-input stops-toolbar-type"
                aria-label="Filter by stop type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="PICKUP">PICKUP</option>
                <option value="DROPOFF">DROPOFF</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => router.push("/routes/stops/new")}
              className="btn btn-primary stops-toolbar-cta"
            >
              <Plus size={18} strokeWidth={2.25} />
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
                              onClick={() => router.push(`/routes/stops/${stop.id}/edit`)}
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

    </div>
  );
}

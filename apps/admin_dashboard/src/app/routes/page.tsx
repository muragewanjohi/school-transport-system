"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Compass, 
  MapPin, 
  Clock, 
  Plus, 
  Trash2, 
  X, 
  Navigation,
  Layers,
  Sparkles,
  Info,
  Edit
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import type mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface DBRoute {
  id: string;
  name: string;
  path: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
}

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

interface DBSchedule {
  id: string;
  route_id: string;
  name: string;
  departure_time: string;
  direction: "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";
  target_grades: string[];
  days_of_week: number[];
}

export default function RoutesManagement() {
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [stops, setStops] = useState<DBStop[]>([]);
  const [schedules, setSchedules] = useState<DBSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stops" | "schedules">("stops");

  // Drawer modal states
  const [showStopDrawer, setShowStopDrawer] = useState(false);
  const [showScheduleDrawer, setShowScheduleDrawer] = useState(false);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  const [stopDrawerMode, setStopDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditStopId, setCurrentEditStopId] = useState<string | null>(null);
  const [scheduleDrawerMode, setScheduleDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditScheduleId, setCurrentEditScheduleId] = useState<string | null>(null);

  const handleStartEditStop = (stop: DBStop) => {
    setStopForm({
      name: stop.name,
      longitude: stop.location.coordinates[0],
      latitude: stop.location.coordinates[1],
      sequence_no: stop.sequence_no,
      geofence_radius_meters: stop.geofence_radius_meters,
      stop_type: stop.stop_type
    });
    setStopDrawerMode("edit");
    setCurrentEditStopId(stop.id);
    setShowStopDrawer(true);
  };

  const handleStartEditSchedule = (sched: DBSchedule) => {
    const timeShort = sched.departure_time.slice(0, 5);
    setScheduleForm({
      name: sched.name,
      departure_time: timeShort,
      direction: sched.direction,
      target_grades: sched.target_grades || [],
      days_of_week: sched.days_of_week || [1, 2, 3, 4, 5]
    });
    setScheduleDrawerMode("edit");
    setCurrentEditScheduleId(sched.id);
    setShowScheduleDrawer(true);
  };

  // Form states for stops
  const [stopForm, setStopForm] = useState({
    name: "",
    longitude: 36.8045,
    latitude: -1.2721,
    sequence_no: 1,
    geofence_radius_meters: 50,
    stop_type: "BOTH" as "PICKUP" | "DROPOFF" | "BOTH"
  });

  // Form states for schedules
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    departure_time: "07:00",
    direction: "HOME_TO_SCHOOL" as "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME",
    target_grades: [] as string[],
    days_of_week: [1, 2, 3, 4, 5]
  });

  // Mapbox references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasMapboxToken = typeof mapboxToken === "string" && mapboxToken.trim().length > 0;

  const currentRoute = routes.find(r => r.id === selectedRouteId) || routes[0];

  // Fetch initial routes, stops, and schedules
  useEffect(() => {
    const fetchRouteData = async () => {
      setIsLoading(true);
      try {
        const routesRes = await fetch("/api/routes");
        const routesJson = await routesRes.json();
        if (routesJson.success) {
          setRoutes(routesJson.data);
          if (routesJson.data.length > 0) {
            setSelectedRouteId(routesJson.data[0].id);
          }
        }

        // Fetch stops
        const stopsRes = await fetch("/api/stops");
        const stopsJson = await stopsRes.json();
        if (stopsJson.success) {
          const localStops = localStorage.getItem("safaricom_stops_sandbox");
          if (localStops) {
            setStops(JSON.parse(localStops));
          } else {
            setStops(stopsJson.data);
            localStorage.setItem("safaricom_stops_sandbox", JSON.stringify(stopsJson.data));
          }
        }

        // Fetch schedules
        const schedulesRes = await fetch("/api/schedules");
        const schedulesJson = await schedulesRes.json();
        if (schedulesJson.success) {
          const localSchedules = localStorage.getItem("safaricom_schedules_sandbox");
          if (localSchedules) {
            setSchedules(JSON.parse(localSchedules));
          } else {
            setSchedules(schedulesJson.data);
            localStorage.setItem("safaricom_schedules_sandbox", JSON.stringify(schedulesJson.data));
          }
        }
      } catch (err) {
        console.error("Error loading route management data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRouteData();
  }, []);

  // Save actions for local caches
  const saveStopsState = (updatedStops: DBStop[]) => {
    setStops(updatedStops);
    localStorage.setItem("safaricom_stops_sandbox", JSON.stringify(updatedStops));
  };

  const saveSchedulesState = (updatedSchedules: DBSchedule[]) => {
    setSchedules(updatedSchedules);
    localStorage.setItem("safaricom_schedules_sandbox", JSON.stringify(updatedSchedules));
  };

  // Dynamic route line from stops sequence
  const updateRouteLine = async (map: mapboxgl.Map, currentRouteStops: DBStop[]) => {
    if (!map.getSource("active-route-src")) return;

    const coords = currentRouteStops.map(s => s.location.coordinates);
    let routeGeometry: any = null;

    if (coords.length >= 2 && mapboxToken) {
      const query = coords.map(c => `${c[0]},${c[1]}`).join(";");
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${query}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            routeGeometry = data.routes[0].geometry;
          }
        }
      } catch (err) {
        console.warn("Mapbox Directions API failed, using straight-line fallback:", err);
      }
    }

    if (!routeGeometry) {
      if (coords.length >= 2) {
        routeGeometry = {
          type: "LineString",
          coordinates: coords
        };
      } else {
        routeGeometry = currentRoute?.path || { type: "LineString", coordinates: [] };
      }
    }

    const source = map.getSource("active-route-src") as any;
    if (source && routeGeometry) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: routeGeometry
      });
    }
  };

  // Mapbox rendering
  useEffect(() => {
    if (!hasMapboxToken || !mapContainerRef.current || !currentRoute) return;

    let mapInstance: mapboxgl.Map;

    const initMap = async () => {
      const mapboxglModule = (await import("mapbox-gl")).default;
      mapboxglModule.accessToken = mapboxToken;

      const centerCoord = currentRoute.path?.coordinates[0] || [36.8045, -1.2721];

      mapInstance = new mapboxglModule.Map({
        container: mapContainerRef.current!,
        style: "mapbox://styles/mapbox/dark-v11",
        center: centerCoord as [number, number],
        zoom: 13,
        pitch: 35,
      });

      mapRef.current = mapInstance;
      mapInstance.addControl(new mapboxglModule.NavigationControl(), "top-right");

      mapInstance.on("load", () => {
        // Draw the selected route path line (always add source so we can update it)
        mapInstance.addSource(`active-route-src`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: currentRoute.path || { type: "LineString", coordinates: [] },
          },
        });

        mapInstance.addLayer({
          id: `active-route-layer`,
          type: "line",
          source: `active-route-src`,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#6366f1",
            "line-width": 5,
            "line-opacity": 0.85,
          },
        });

        // Draw stop markers
        updateMapMarkers(mapInstance, mapboxglModule);
        updateRouteLine(mapInstance, routeStops);
      });
    };

    initMap();

    return () => {
      if (mapInstance) {
        mapInstance.remove();
      }
    };
  }, [selectedRouteId, routes, hasMapboxToken]);

  // Update map markers when stops list updates
  const updateMapMarkers = async (map: mapboxgl.Map, mapboxglModule: any) => {
    // Clear old markers
    stopMarkersRef.current.forEach(marker => marker.remove());
    stopMarkersRef.current = [];

    const routeStops = stops
      .filter(s => s.route_id === selectedRouteId)
      .sort((a, b) => a.sequence_no - b.sequence_no);
    
    routeStops.forEach((stop) => {
      const el = document.createElement("div");
      el.className = "map-stop-marker";
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = "rgba(99, 102, 241, 0.25)";
      el.style.border = "2px solid #6366f1";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.color = "#ffffff";
      el.style.fontWeight = "bold";
      el.style.fontSize = "10px";
      el.textContent = stop.sequence_no.toString();
      el.style.boxShadow = "0 0 8px #6366f1";

      const popup = new mapboxglModule.Popup({ offset: 15 }).setHTML(
        `<div style="color:#0f172a; font-family:var(--font-sans); padding:4px;">
          <h4 style="font-weight:600; margin:0 0 2px 0;">Stop #${stop.sequence_no}: ${stop.name}</h4>
          <span style="font-size:0.75rem; color:#64748b;">Radius: ${stop.geofence_radius_meters}m • Type: ${stop.stop_type}</span>
         </div>`
      );

      const marker = new mapboxglModule.Marker(el)
        .setLngLat(stop.location.coordinates as [number, number])
        .setPopup(popup)
        .addTo(map);

      stopMarkersRef.current.push(marker);
    });
  };

  // Automatically update map markers and route lines if Mapbox is running and stops/route change
  useEffect(() => {
    if (mapRef.current) {
      import("mapbox-gl").then(module => {
        updateMapMarkers(mapRef.current!, module.default);
        updateRouteLine(mapRef.current!, routeStops);
      });
    }
  }, [stops, selectedRouteId]);

  // Stops handlers
  const handleAddStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopForm.name.trim()) return;
    setIsSubmitLoading(true);

    const payload = {
      route_id: selectedRouteId,
      name: stopForm.name,
      longitude: parseFloat(stopForm.longitude as any),
      latitude: parseFloat(stopForm.latitude as any),
      sequence_no: parseInt(stopForm.sequence_no as any),
      geofence_radius_meters: parseInt(stopForm.geofence_radius_meters as any),
      stop_type: stopForm.stop_type
    };

    try {
      const url = stopDrawerMode === "edit" ? `/api/stops/${currentEditStopId}` : "/api/stops";
      const method = stopDrawerMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        const savedStop: DBStop = {
          id: stopDrawerMode === "edit" ? currentEditStopId! : (json.data.id || `stop-${Date.now()}`),
          route_id: payload.route_id,
          name: payload.name,
          location: {
            type: "Point",
            coordinates: [payload.longitude, payload.latitude]
          },
          sequence_no: payload.sequence_no,
          geofence_radius_meters: payload.geofence_radius_meters,
          stop_type: payload.stop_type
        };
        
        let updated;
        if (stopDrawerMode === "edit") {
          updated = stops.map(s => s.id === savedStop.id ? savedStop : s);
        } else {
          updated = [...stops, savedStop];
        }
        updated.sort((a, b) => a.sequence_no - b.sequence_no);
        saveStopsState(updated);
        setShowStopDrawer(false);
        setStopForm({
          name: "",
          longitude: 36.8045,
          latitude: -1.2721,
          sequence_no: routeStops.length + 2,
          geofence_radius_meters: 50,
          stop_type: "BOTH"
        });
      } else {
        alert(json.error || "Failed to save stop");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteStop = async (id: string) => {
    if (!confirm("Are you sure you want to delete this route stop? Any student assigned to this stop will revert to Standby status.")) return;

    try {
      const res = await fetch(`/api/stops/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        const filtered = stops.filter(s => s.id !== id);
        saveStopsState(filtered);
      }
    } catch (err) {
      console.error("Failed to delete stop:", err);
    }
  };

  // Schedules handlers
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.name.trim()) return;
    setIsSubmitLoading(true);

    const timeParts = scheduleForm.departure_time.split(":");
    const departureTime = timeParts.length === 2 
      ? `${scheduleForm.departure_time}:00` 
      : scheduleForm.departure_time;

    const payload = {
      route_id: selectedRouteId,
      name: scheduleForm.name,
      departure_time: departureTime,
      direction: scheduleForm.direction,
      target_grades: scheduleForm.target_grades,
      days_of_week: scheduleForm.days_of_week
    };

    try {
      const url = scheduleDrawerMode === "edit" ? `/api/schedules/${currentEditScheduleId}` : "/api/schedules";
      const method = scheduleDrawerMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        const savedSchedule: DBSchedule = {
          id: scheduleDrawerMode === "edit" ? currentEditScheduleId! : (json.data.id || `sched-${Date.now()}`),
          route_id: payload.route_id,
          name: payload.name,
          departure_time: payload.departure_time,
          direction: payload.direction,
          target_grades: payload.target_grades,
          days_of_week: payload.days_of_week
        };

        let updated;
        if (scheduleDrawerMode === "edit") {
          updated = schedules.map(s => s.id === savedSchedule.id ? savedSchedule : s);
        } else {
          updated = [...schedules, savedSchedule];
        }
        saveSchedulesState(updated);
        setShowScheduleDrawer(false);
        setScheduleForm({
          name: "",
          departure_time: "07:00",
          direction: "HOME_TO_SCHOOL",
          target_grades: [],
          days_of_week: [1, 2, 3, 4, 5]
        });
      } else {
        alert(json.error || "Failed to save schedule");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trip schedule run? Daily manifests linked to this schedule will be unlinked.")) return;

    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        const filtered = schedules.filter(s => s.id !== id);
        saveSchedulesState(filtered);
      }
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    }
  };

  const handleGradeCheckboxChange = (grade: string, checked: boolean) => {
    setScheduleForm(prev => ({
      ...prev,
      target_grades: checked 
        ? [...prev.target_grades, grade]
        : prev.target_grades.filter(g => g !== grade)
    }));
  };

  const handleDayCheckboxChange = (dayNum: number, checked: boolean) => {
    setScheduleForm(prev => ({
      ...prev,
      days_of_week: checked 
        ? [...prev.days_of_week, dayNum]
        : prev.days_of_week.filter(d => d !== dayNum)
    }));
  };

  const routeStops = stops.filter(s => s.route_id === selectedRouteId).sort((a, b) => a.sequence_no - b.sequence_no);
  const routeSchedules = schedules.filter(s => s.route_id === selectedRouteId);

  const getDirectionText = (dir: string) => {
    return dir === "HOME_TO_SCHOOL" ? "AM Route (Home to School)" : "PM Route (School to Home)";
  };

  const getDaysText = (days: number[]) => {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map(d => dayNames[d - 1]).join(", ");
  };

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .route-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-default);
          border-radius: 8px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .route-item:hover {
          border-color: rgba(99, 102, 241, 0.3);
          background: rgba(255, 255, 255, 0.04);
        }
        .route-item.active {
          border-color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.08);
        }
        .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 600;
          padding: 10px 16px;
          cursor: pointer;
          position: relative;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .tab-btn.active {
          color: var(--text-primary);
        }
        .tab-btn.active::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 16px;
          right: 16px;
          height: 2px;
          background: var(--accent-primary);
          box-shadow: 0 0 8px var(--accent-primary);
        }
      `}</style>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <span className="top-bar-title">Transit Route Planner</span>
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
              Core Mapping
            </span>
          </div>
        </header>

        <section className="dashboard-content-layout" style={{ gridTemplateColumns: "300px 1fr", gap: "24px" }}>
          {/* Left panel: Routes list */}
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <Compass size={18} style={{ color: "var(--accent-primary)" }} />
              Active Routes
            </span>

            {isLoading ? (
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading routes...</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
                {routes.map(route => (
                  <div 
                    key={route.id} 
                    className={`route-item ${route.id === selectedRouteId ? "active" : ""}`}
                    onClick={() => {
                      setSelectedRouteId(route.id);
                      setStopForm(prev => ({ ...prev, sequence_no: stops.filter(s => s.route_id === route.id).length + 1 }));
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, display: "block", color: "var(--text-primary)" }}>{route.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {stops.filter(s => s.route_id === route.id).length} stops • {schedules.filter(s => s.route_id === route.id).length} run schedules
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: Route detailing & Map */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Map viewport */}
            <div className="panel" style={{ padding: 0, overflow: "hidden", position: "relative", minHeight: "350px" }}>
              {hasMapboxToken ? (
                <div 
                  ref={mapContainerRef} 
                  style={{ height: "350px", width: "100%" }}
                />
              ) : (
                <div className="map-placeholder" style={{ height: "350px" }}>
                  <div className="map-grid-overlay"></div>
                  <div className="map-radar-glow"></div>
                  
                  {/* Alert banner */}
                  <div style={{
                    position: "absolute",
                    top: "16px",
                    left: "16px",
                    right: "16px",
                    background: "rgba(12, 17, 34, 0.9)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "0.8rem",
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    zIndex: 5,
                    backdropFilter: "blur(4px)"
                  }}>
                    <Info size={16} style={{ color: "var(--accent-secondary)" }} />
                    <div>
                      <strong style={{ color: "var(--accent-secondary)" }}>Simulated Path View</strong>. Insert <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> in your environment parameters for dark style maps.
                    </div>
                  </div>

                  {/* Draw mock stops as markers */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                    {routeStops.map((stop, idx) => {
                      // Distribute mock positions visually on the grid
                      const xPercent = 20 + (idx * 20) % 60;
                      const yPercent = 30 + (idx * 15) % 50;
                      return (
                        <div 
                          key={stop.id} 
                          className="map-bus-node" 
                          style={{ position: "absolute", top: `${yPercent}%`, left: `${xPercent}%` }}
                        >
                          <div 
                            className="bus-dot" 
                            style={{ 
                              background: "rgba(99, 102, 241, 0.2)", 
                              border: "2px solid var(--accent-primary)", 
                              boxShadow: "0 0 10px var(--accent-primary)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#ffffff",
                              fontSize: "0.7rem",
                              fontWeight: "bold",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%"
                            }}
                          >
                            {stop.sequence_no}
                          </div>
                          <div className="bus-label">{stop.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Stops / Schedules tabs list */}
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", borderBottom: "1px solid var(--border-default)", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex" }}>
                  <button 
                    onClick={() => setActiveTab("stops")} 
                    className={`tab-btn ${activeTab === "stops" ? "active" : ""}`}
                  >
                    Stops & Geofences ({routeStops.length})
                  </button>
                  <button 
                    onClick={() => setActiveTab("schedules")} 
                    className={`tab-btn ${activeTab === "schedules" ? "active" : ""}`}
                  >
                    Timing Schedules ({routeSchedules.length})
                  </button>
                </div>

                {activeTab === "stops" ? (
                  <button 
                    onClick={() => {
                      setStopForm({
                        name: "",
                        longitude: 36.8045,
                        latitude: -1.2721,
                        sequence_no: routeStops.length + 1,
                        geofence_radius_meters: 50,
                        stop_type: "BOTH"
                      });
                      setStopDrawerMode("add");
                      setCurrentEditStopId(null);
                      setShowStopDrawer(true);
                    }}
                    style={{
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "var(--accent-secondary)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Plus size={14} />
                    Add Route Stop
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setScheduleForm({
                        name: "",
                        departure_time: "07:00",
                        direction: "HOME_TO_SCHOOL",
                        target_grades: [],
                        days_of_week: [1, 2, 3, 4, 5]
                      });
                      setScheduleDrawerMode("add");
                      setCurrentEditScheduleId(null);
                      setShowScheduleDrawer(true);
                    }}
                    style={{
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "var(--accent-secondary)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Plus size={14} />
                    Add Run Schedule
                  </button>
                )}
              </div>

              {/* Tab contents */}
              {activeTab === "stops" ? (
                routeStops.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No stops assigned to this route yet. Click "Add Route Stop" to configure one.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="student-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Seq</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Stop Name</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Coordinates</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Geofence</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Type</th>
                          <th style={{ padding: "10px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeStops.map(stop => (
                          <tr key={stop.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "12px 10px", fontWeight: "bold", color: "var(--accent-primary)" }}>#{stop.sequence_no}</td>
                            <td style={{ padding: "12px 10px", fontWeight: 600, color: "var(--text-primary)" }}>{stop.name}</td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              {stop.location.coordinates[1].toFixed(5)}, {stop.location.coordinates[0].toFixed(5)}
                            </td>
                            <td style={{ padding: "12px 10px", color: "var(--text-primary)" }}>{stop.geofence_radius_meters} meters</td>
                            <td style={{ padding: "12px 10px" }}>
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
                            <td style={{ padding: "12px 10px", textAlign: "right" }}>
                              <button 
                                onClick={() => handleStartEditStop(stop)}
                                style={{ background: "rgba(99,102,241,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--accent-secondary)", marginRight: "8px" }}
                              >
                                <Edit size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteStop(stop.id)}
                                style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                routeSchedules.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No timing run schedules configured. Click "Add Run Schedule" to start session planner.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="student-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Schedule Name</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Dep. Time</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Direction</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Target Grades</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Operating Days</th>
                          <th style={{ padding: "10px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeSchedules.map(sched => (
                          <tr key={sched.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "12px 10px", fontWeight: 600, color: "var(--text-primary)" }}>{sched.name}</td>
                            <td style={{ padding: "12px 10px", fontWeight: "bold", color: "var(--accent-secondary)" }}>
                              <Clock size={12} style={{ display: "inline", marginRight: "4px" }} />
                              {sched.departure_time.slice(0, 5)}
                            </td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-primary)" }}>{getDirectionText(sched.direction)}</td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              {sched.target_grades && sched.target_grades.length > 0 
                                ? sched.target_grades.join(", ") 
                                : "All Grades"}
                            </td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>{getDaysText(sched.days_of_week)}</td>
                            <td style={{ padding: "12px 10px", textAlign: "right" }}>
                              <button 
                                onClick={() => handleStartEditSchedule(sched)}
                                style={{ background: "rgba(99,102,241,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--accent-secondary)", marginRight: "8px" }}
                              >
                                <Edit size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSchedule(sched.id)}
                                style={{ background: "rgba(244,63,94,0.05)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "var(--state-error)" }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

          </div>
        </section>
      </main>

      {/* Stop onboard drawer */}
      {showStopDrawer && (
        <div className="drawer-overlay" onClick={() => setShowStopDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <MapPin size={18} style={{ color: "var(--accent-primary)" }} />
                {stopDrawerMode === "edit" ? "Edit Route Stop Point" : "Add Route Stop Point"}
              </h2>
              <button onClick={() => setShowStopDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddStop} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Stop Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Kileleshwa Githunguri Road"
                  className="form-input"
                  value={stopForm.name}
                  onChange={(e) => setStopForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Latitude *</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    required
                    className="form-input"
                    value={stopForm.latitude}
                    onChange={(e) => setStopForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude *</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    required
                    className="form-input"
                    value={stopForm.longitude}
                    onChange={(e) => setStopForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) }))}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Sequence No *</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    className="form-input"
                    value={stopForm.sequence_no}
                    onChange={(e) => setStopForm(prev => ({ ...prev, sequence_no: parseInt(e.target.value) }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Geofence Radius (Meters) *</label>
                  <input 
                    type="number" 
                    required
                    min="10"
                    className="form-input"
                    value={stopForm.geofence_radius_meters}
                    onChange={(e) => setStopForm(prev => ({ ...prev, geofence_radius_meters: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Stop Type *</label>
                <select 
                  className="form-input"
                  value={stopForm.stop_type}
                  onChange={(e) => setStopForm(prev => ({ ...prev, stop_type: e.target.value as any }))}
                >
                  <option value="BOTH">BOTH (Pickup and Dropoff)</option>
                  <option value="PICKUP">PICKUP Only</option>
                  <option value="DROPOFF">DROPOFF Only</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowStopDrawer(false)}
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
                  {isSubmitLoading ? "Saving Stop..." : (stopDrawerMode === "edit" ? "Update Route Stop" : "Save Route Stop")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule onboard drawer */}
      {showScheduleDrawer && (
        <div className="drawer-overlay" onClick={() => setShowScheduleDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Clock size={18} style={{ color: "var(--accent-primary)" }} />
                {scheduleDrawerMode === "edit" ? "Edit timing Run Schedule" : "Add timing Run Schedule"}
              </h2>
              <button onClick={() => setShowScheduleDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSchedule} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Schedule Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Early AM Run (Lower Primary)"
                  className="form-input"
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Departure Time *</label>
                  <input 
                    type="time" 
                    required
                    className="form-input"
                    value={scheduleForm.departure_time}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, departure_time: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Transit Direction *</label>
                  <select 
                    className="form-input"
                    value={scheduleForm.direction}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, direction: e.target.value as any }))}
                  >
                    <option value="HOME_TO_SCHOOL">Home to School (AM)</option>
                    <option value="SCHOOL_TO_HOME">School to Home (PM)</option>
                  </select>
                </div>
              </div>

              {/* Target grades selection */}
              <div className="form-group">
                <label className="form-label">Target Grade Classes *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "rgba(0,0,0,0.15)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                  {["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"].map(grade => (
                    <label key={grade} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-primary)", cursor: "pointer" }}>
                      <input 
                        type="checkbox"
                        checked={scheduleForm.target_grades.includes(grade)}
                        onChange={(e) => handleGradeCheckboxChange(grade, e.target.checked)}
                      />
                      {grade}
                    </label>
                  ))}
                </div>
              </div>

              {/* Operating days */}
              <div className="form-group">
                <label className="form-label">Operating Days *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", background: "rgba(0,0,0,0.15)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                  {[
                    { num: 1, label: "Mon" },
                    { num: 2, label: "Tue" },
                    { num: 3, label: "Wed" },
                    { num: 4, label: "Thu" },
                    { num: 5, label: "Fri" }
                  ].map(day => (
                    <label key={day.num} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8rem", color: "var(--text-primary)", cursor: "pointer" }}>
                      <input 
                        type="checkbox"
                        checked={scheduleForm.days_of_week.includes(day.num)}
                        onChange={(e) => handleDayCheckboxChange(day.num, e.target.checked)}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowScheduleDrawer(false)}
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
                  {isSubmitLoading ? "Saving Schedule..." : (scheduleDrawerMode === "edit" ? "Update Run Schedule" : "Save Run Schedule")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

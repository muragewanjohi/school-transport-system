"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Users,
  Bus,
  Clock,
  Bell,
  CheckCircle2,
  Info,
  Building2,
  Route as RouteIcon,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { ThemeToggle } from "@/components/ThemeProvider";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  classifyTelemetry,
  latestTelemetryByVehicle,
  parseTelemetryLatLng,
  type FleetTelemetryRow,
} from "@/lib/fleetMapTelemetry";
import { adminStopAlertMessage, type StopVisitOutcome } from "@/lib/stopVisitOutcome";

declare global {
  interface Window {
    google: any;
    initGoogleMapsDashboard?: () => void;
  }
}

interface TelemetryEvent {
  id: string;
  time: string;
  route: string;
  type: "info" | "success" | "error";
  message: string;
}

interface DBRoute {
  id: string;
  name: string;
  path: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
}

interface Guardian {
  name: string;
  phone: string;
}

interface DBStudent {
  id: string;
  name: string;
  route_id: string;
  nfc_card_hash: string | null;
  status: "Present" | "Absent";
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  schedule_ids: string[];
  guardians: Guardian[];
  grade?: string | null;
  class_name?: string | null;
  route?: {
    name: string;
  } | null;
}

interface DBStop {
  id: string;
  name: string;
  route_id: string;
  sequence_no: number;
  duration_from_prev_seconds?: number;
  location?: {
    coordinates: [number, number];
  };
}

type StopVisitAlertRow = {
  id: string;
  outcome: StopVisitOutcome;
  dwell_seconds: number;
  created_at: string;
  stop_name: string;
  route_name: string;
  vehicle_plate: string;
};

function stopVisitToEvent(row: StopVisitAlertRow): TelemetryEvent {
  const created = new Date(row.created_at);
  const time = Number.isNaN(created.getTime())
    ? ""
    : created.toLocaleTimeString("en-US", { hour12: true });
  return {
    id: row.id,
    time,
    route: row.vehicle_plate || row.route_name,
    type: "error",
    message:
      adminStopAlertMessage({
        outcome: row.outcome,
        stopName: row.stop_name,
        routeName: row.route_name,
        vehiclePlate: row.vehicle_plate,
      }) ?? `${row.vehicle_plate} stop update at ${row.stop_name}`,
  };
}

const LIGHT_MAP_STYLES: unknown[] = [];
const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
];

export default function DashboardPage() {
  const [busesActive, setBusesActive] = useState(0);
  const [boardedCount, setBoardedCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const sosCount = 0;
  const [schoolName, setSchoolName] = useState("School Dashboard");

  const [students, setStudents] = useState<DBStudent[]>([]);
  const [stops, setStops] = useState<DBStop[]>([]);
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [tripCounts, setTripCounts] = useState({
    completed: 0,
    ongoing: 0,
    scheduled: 0,
  });

  const [events, setEvents] = useState<TelemetryEvent[]>([]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const vehicleLabelsRef = useRef<Record<string, string>>({});
  const didFitBoundsRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [fleetLegend, setFleetLegend] = useState({ moving: 0, stopped: 0, stale: 0 });

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const upsertBusMarker = (vehicleId: string, lat: number, lng: number, title: string) => {
    if (!mapRef.current || !window.google?.maps) return;
    const existing = markersRef.current[vehicleId];
    if (existing) {
      existing.setPosition({ lat, lng });
      existing.setTitle(title);
      return;
    }
    const busMarker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapRef.current,
      title,
      icon: {
        url: "/assets/bus-icon.png",
        scaledSize: new window.google.maps.Size(46, 46),
        origin: new window.google.maps.Point(0, 0),
        anchor: new window.google.maps.Point(23, 23),
      },
    });
    markersRef.current[vehicleId] = busMarker;
  };

  const applyTelemetryToMap = (rows: FleetTelemetryRow[], fitBounds: boolean) => {
    if (!mapRef.current || !window.google?.maps) return;
    const latest = latestTelemetryByVehicle(rows);
    let moving = 0;
    let stopped = 0;
    let stale = 0;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    for (const row of latest) {
      const point = parseTelemetryLatLng(row.coordinates);
      if (!point) continue;
      const title = vehicleLabelsRef.current[row.vehicle_id] || "Bus";
      upsertBusMarker(row.vehicle_id, point.lat, point.lng, title);
      bounds.extend({ lat: point.lat, lng: point.lng });
      hasPoint = true;
      const kind = classifyTelemetry(row);
      if (kind === "moving") moving += 1;
      else if (kind === "stopped") stopped += 1;
      else stale += 1;
    }
    setFleetLegend({ moving, stopped, stale });
    setBusesActive(moving + stopped);
    if (fitBounds && hasPoint && !didFitBoundsRef.current) {
      mapRef.current.fitBounds(bounds, 80);
      didFitBoundsRef.current = true;
    }
  };

  const loadLiveFleet = async (fitBounds: boolean) => {
    try {
      const [fleetRes, teleRes] = await Promise.all([fetch("/api/fleet"), fetch("/api/telemetry")]);
      const fleetJson = (await fleetRes.json()) as {
        success?: boolean;
        data?: Array<{ id: string; license_plate?: string }>;
      };
      if (fleetJson.success && Array.isArray(fleetJson.data)) {
        const labels: Record<string, string> = {};
        for (const v of fleetJson.data) {
          labels[v.id] = v.license_plate || "Bus";
        }
        vehicleLabelsRef.current = labels;
      }
      const teleJson = (await teleRes.json()) as {
        success?: boolean;
        data?: FleetTelemetryRow[];
      };
      if (teleJson.success && Array.isArray(teleJson.data)) {
        applyTelemetryToMap(teleJson.data, fitBounds);
      }
    } catch (err) {
      console.error("Failed to load live fleet positions:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initMap = () => {
      if (!mapContainerRef.current || !window.google || !window.google.maps) return;

      const isDark = document.documentElement.dataset.theme === "dark";
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: -1.2721, lng: 36.8045 },
        zoom: 13,
        mapTypeId: "roadmap",
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        styles: isDark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
      });

      mapRef.current = map;

      fetch("/api/routes")
        .then((res) => res.json())
        .then((json) => {
          if (!isMounted || !mapRef.current) return;
          if (json.success && Array.isArray(json.data)) {
            json.data.forEach((route: DBRoute) => {
              if (route.path && route.path.coordinates && Array.isArray(route.path.coordinates)) {
                const pathCoords = route.path.coordinates.map((c: [number, number]) => ({
                  lat: c[1],
                  lng: c[0],
                }));

                const routeColor =
                  route.id === "route-4" || route.id.includes("4") ? "#6366f1" : "#10b981";

                new window.google.maps.Polyline({
                  path: pathCoords,
                  geodesic: true,
                  strokeColor: routeColor,
                  strokeOpacity: 0.85,
                  strokeWeight: 5,
                  map: map,
                });
              }
            });
          }
        })
        .catch((err) => console.error("Error loading map routes:", err));

      fetch("/api/campuses")
        .then((res) => res.json())
        .then((json: { success?: boolean; data?: Array<{ name: string; latitude: number; longitude: number }> }) => {
          if (!isMounted || !mapRef.current || !json.success || !Array.isArray(json.data)) return;
          json.data.forEach((loc) => {
            const schoolMarker = new window.google.maps.Marker({
              position: { lat: loc.latitude, lng: loc.longitude },
              map: map,
              title: loc.name,
              icon: {
                url: "/assets/school-location-icon.png",
                scaledSize: new window.google.maps.Size(42, 42),
                origin: new window.google.maps.Point(0, 0),
                anchor: new window.google.maps.Point(21, 21),
              },
            });
            const infoWindow = new window.google.maps.InfoWindow({
              content: `<div style="color:#0f172a; padding:4px; font-family:sans-serif;">
            <h4 style="margin:0 0 4px 0; font-weight:600;">School: ${loc.name}</h4>
            <span style="font-size:0.75rem; color:#64748b;">Coordinates: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</span>
          </div>`,
            });
            schoolMarker.addListener("click", () => {
              infoWindow.open(map, schoolMarker);
            });
          });
        })
        .catch((err) => console.error("Error loading campus markers:", err));

      void loadLiveFleet(true);
      setMapReady(true);
    };

    if (window.google && window.google.maps) {
      initMap();
    } else {
      const scriptId = "google-maps-js-script-dashboard";
      let script = document.getElementById(scriptId) as HTMLScriptElement;

      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          googleApiKey
        )}&libraries=places&callback=initGoogleMapsDashboard`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      window.initGoogleMapsDashboard = () => {
        if (isMounted) initMap();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [googleApiKey]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("db-telemetry-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_coordinates" },
        (payload) => {
          const record = payload.new;
          let lng = 36.8045;
          let lat = -1.2721;

          if (record.coordinates) {
            if (typeof record.coordinates === "object" && Array.isArray(record.coordinates.coordinates)) {
              [lng, lat] = record.coordinates.coordinates;
            } else if (typeof record.coordinates === "string") {
              const match = record.coordinates.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
              if (match) {
                lng = parseFloat(match[1]);
                lat = parseFloat(match[2]);
              }
            }
          }

          const speedVal = record.speed ? `${record.speed} km/h` : "N/A";
          const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
          const plate = vehicleLabelsRef.current[record.vehicle_id] || "Bus";

          const newEvent: TelemetryEvent = {
            id: record.id || Date.now().toString(),
            time: newTime,
            route: plate,
            type: "info",
            message: `Live GPS: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)} (${speedVal})`,
          };

          setEvents((prev) => [newEvent, ...prev.slice(0, 15)]);

          if (record.vehicle_id && mapRef.current) {
            upsertBusMarker(record.vehicle_id, lat, lng, plate);
            mapRef.current.panTo({ lat, lng });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_stop_visits" },
        () => {
          void fetch("/api/alerts")
            .then((res) => res.json())
            .then((json: { success?: boolean; data?: StopVisitAlertRow[] }) => {
              if (!json.success || !Array.isArray(json.data)) return;
              const alertEvents = json.data.map(stopVisitToEvent);
              setAlertCount(alertEvents.length);
              setEvents((prev) => {
                const ids = new Set(alertEvents.map((e) => e.id));
                const rest = prev.filter((e) => !ids.has(e.id));
                return [...alertEvents, ...rest].slice(0, 16);
              });
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    void loadLiveFleet(true);
    const timer = window.setInterval(() => {
      void loadLiveFleet(false);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [mapReady]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [stopsRes, routesRes, studentsRes, configRes, tripsRes, alertsRes] = await Promise.all([
          fetch("/api/stops"),
          fetch("/api/routes"),
          fetch("/api/students"),
          fetch("/api/config"),
          fetch("/api/trips"),
          fetch("/api/alerts"),
        ]);

        const stopsJson = await stopsRes.json();
        if (stopsJson.success) setStops(stopsJson.data || []);

        const routesJson = await routesRes.json();
        if (routesJson.success) setRoutes(routesJson.data || []);

        const studentsJson = await studentsRes.json();
        if (studentsJson.success) {
          const list = (studentsJson.data || []) as DBStudent[];
          setStudents(list);
          const present = list.filter((s) => s.status === "Present").length;
          setBoardedCount(present);
        }

        const configJson = await configRes.json();
        if (configJson.success && configJson.data?.school_name) {
          setSchoolName(configJson.data.school_name as string);
        }

        const tripsJson = await tripsRes.json();
        if (tripsJson.success && Array.isArray(tripsJson.data)) {
          const trips = tripsJson.data as Array<{ status?: string }>;
          const completed = trips.filter((t) => t.status === "completed").length;
          const ongoing = trips.filter(
            (t) => t.status === "in_progress" || t.status === "active" || t.status === "ongoing"
          ).length;
          const scheduled = trips.filter(
            (t) => t.status === "scheduled" || t.status === "pending"
          ).length;
          setTripCounts({
            completed,
            ongoing,
            scheduled,
          });
        }

        const alertsJson = await alertsRes.json();
        if (alertsJson.success && Array.isArray(alertsJson.data)) {
          const alertEvents = (alertsJson.data as StopVisitAlertRow[]).map(stopVisitToEvent);
          setAlertCount(alertEvents.length);
          setEvents((prev) => {
            const gps = prev.filter((e) => !e.id.startsWith("alert-") && !alertEvents.some((a) => a.id === e.id));
            return [...alertEvents, ...gps].slice(0, 16);
          });
        }
      } catch (err) {
        console.error("Failed to load dashboard overview data:", err);
      }
    };
    fetchDashboardData();
  }, []);

  const presentCount = useMemo(
    () => students.filter((s) => s.status === "Present").length || boardedCount,
    [students, boardedCount]
  );
  const absentCount = useMemo(
    () => students.filter((s) => s.status === "Absent").length,
    [students]
  );
  const pendingCount = Math.max(students.length - presentCount - absentCount, 0);
  const totalStudents = students.length || presentCount + absentCount + pendingCount;
  const presentPct = totalStudents ? Math.round((presentCount / totalStudents) * 100) : 0;
  const absentPct = totalStudents ? Math.round((absentCount / totalStudents) * 100) : 0;
  const pendingPct = Math.max(0, 100 - presentPct - absentPct);

  const upcomingStops = useMemo(() => {
    const sorted = [...stops].sort((a, b) => a.sequence_no - b.sequence_no).slice(0, 6);
    const now = new Date();
    return sorted.map((stop, idx) => {
      const etaMins = Math.max(2, Math.round((stop.duration_from_prev_seconds || 300) / 60));
      const eta = new Date(now.getTime() + (idx + 1) * etaMins * 60_000);
      const routeName = routes.find((r) => r.id === stop.route_id)?.name || "Route";
      return {
        id: stop.id,
        name: stop.name,
        routeName,
        time: eta.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        etaLabel: `${etaMins + idx * 2} min`,
      };
    });
  }, [stops, routes]);

  const donutStyle = {
    background: `conic-gradient(
      var(--accent-primary) 0% ${presentPct}%,
      var(--state-error) ${presentPct}% ${presentPct + absentPct}%,
      var(--state-warning) ${presentPct + absentPct}% 100%
    )`,
  };

  const scheduledTrips = tripCounts.scheduled;
  const completedTrips = tripCounts.completed;
  const ongoingTrips = tripCounts.ongoing;

  return (
    <div className="app-container">
      <Sidebar />

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="school-chip">
              <Building2 size={16} style={{ color: "var(--accent-primary)" }} />
              {schoolName}
            </span>
          </div>

          <div className="top-bar-actions">
            <button type="button" className="icon-btn" aria-label="Notifications">
              <Bell size={16} />
              {(sosCount > 0 || alertCount > 0) && (
                <span className="icon-btn-badge">{Math.min(sosCount || alertCount, 99)}</span>
              )}
            </button>
            <ThemeToggle className="theme-toggle-compact" />
            <UserProfileBadge />
          </div>
        </header>

        <div className="dash-home">
          <section className="dash-kpi-grid">
            <div className="dash-kpi">
              <div className="dash-kpi-icon green">
                <Bus size={20} />
              </div>
              <div className="dash-kpi-label">Active Buses</div>
              <div className="dash-kpi-value">{busesActive}</div>
              <div className="dash-kpi-trend">Live fleet status</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-icon blue">
                <Users size={20} />
              </div>
              <div className="dash-kpi-label">Students on Board</div>
              <div className="dash-kpi-value">{presentCount}</div>
              <div className="dash-kpi-trend">Present check-ins</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-icon purple">
                <RouteIcon size={20} />
              </div>
              <div className="dash-kpi-label">Today&apos;s Trips</div>
              <div className="dash-kpi-value">{scheduledTrips}</div>
              <div className="dash-kpi-trend">{ongoingTrips} ongoing</div>
            </div>
            <div className="dash-kpi">
              <div className="dash-kpi-icon amber">
                <Clock size={20} />
              </div>
              <div className="dash-kpi-label">Alerts / SOS</div>
              <div className="dash-kpi-value">{sosCount > 0 ? sosCount : alertCount}</div>
              <div className="dash-kpi-trend" style={{ color: sosCount > 0 ? "var(--state-error)" : undefined }}>
                {sosCount > 0 ? "Urgent SOS active" : "Proximity & ops alerts"}
              </div>
            </div>
          </section>

          <section className="dash-mid-grid">
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Live Fleet Map</span>
                <Link href="/fleet" className="dash-card-link">
                  View all buses →
                </Link>
              </div>
              <div ref={mapContainerRef} className="dash-map" />
              <div className="dash-legend">
                <span className="dash-legend-item">
                  <span className="dash-dot moving" /> Moving: {fleetLegend.moving}
                </span>
                <span className="dash-legend-item">
                  <span className="dash-dot stopped" /> Stopped: {fleetLegend.stopped}
                </span>
                <span className="dash-legend-item">
                  <span className="dash-dot idle" /> Last seen: {fleetLegend.stale}
                </span>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Upcoming Stops</span>
                <Link href="/routes/stops" className="dash-card-link">
                  View all
                </Link>
              </div>
              <div className="dash-stop-list">
                {upcomingStops.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "24px 0" }}>
                    No stops loaded yet. Add stops under Routes.
                  </div>
                ) : (
                  upcomingStops.map((stop) => (
                    <div className="dash-stop-item" key={stop.id}>
                      <span className="dash-stop-time">{stop.time}</span>
                      <div>
                        <div className="dash-stop-name">{stop.name}</div>
                        <div className="dash-stop-meta">{stop.routeName}</div>
                      </div>
                      <span className="dash-stop-eta">{stop.etaLabel}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="dash-bottom-grid">
            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Attendance Overview</span>
                <Link href="/students" className="dash-card-link">
                  View full report →
                </Link>
              </div>
              <div className="dash-attendance">
                <div className="dash-donut" style={donutStyle}>
                  <div className="dash-donut-hole">
                    <span className="dash-donut-value">{totalStudents || presentCount}</span>
                    <span className="dash-donut-label">Total Students</span>
                  </div>
                </div>
                <div className="dash-legend-col">
                  <div className="dash-legend-row">
                    <span>
                      <span className="dash-dot moving" /> Present
                    </span>
                    <strong>
                      {presentCount} ({presentPct}%)
                    </strong>
                  </div>
                  <div className="dash-legend-row">
                    <span>
                      <span className="dash-dot" style={{ background: "var(--state-error)" }} /> Absent
                    </span>
                    <strong>
                      {absentCount} ({absentPct}%)
                    </strong>
                  </div>
                  <div className="dash-legend-row">
                    <span>
                      <span className="dash-dot idle" /> Pending
                    </span>
                    <strong>
                      {pendingCount} ({pendingPct}%)
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Trip Summary (Today)</span>
                <Link href="/routes/today-trips" className="dash-card-link">
                  View all trips →
                </Link>
              </div>
              <div className="dash-trip-rows">
                <div className="dash-trip-row">
                  <span>Completed Trips</span>
                  <strong>{completedTrips}</strong>
                </div>
                <div className="dash-trip-row">
                  <span>Ongoing Trips</span>
                  <strong>{ongoingTrips}</strong>
                </div>
                <div className="dash-trip-row">
                  <span>Scheduled Trips</span>
                  <strong>{scheduledTrips}</strong>
                </div>
              </div>
            </div>

            <div className="dash-card">
              <div className="dash-card-header">
                <span className="dash-card-title">Recent Alerts</span>
                <Link href="/dashboard" className="dash-card-link">
                  View all
                </Link>
              </div>
              <div className="dash-alert-list">
                {events.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "24px 0" }}>
                    No stop or GPS alerts yet. Skipped or drive-through stops appear here.
                  </div>
                ) : (
                  events.slice(0, 6).map((event) => (
                  <div className="dash-alert-item" key={event.id}>
                    <div className={`dash-alert-icon ${event.type}`}>
                      {event.type === "success" ? (
                        <CheckCircle2 size={14} />
                      ) : event.type === "error" ? (
                        <AlertCircle size={14} />
                      ) : (
                        <Info size={14} />
                      )}
                    </div>
                    <div className="dash-alert-body">
                      <div className="dash-alert-msg">{event.message}</div>
                      <div className="dash-alert-meta">
                        {event.time} · {event.route}
                      </div>
                    </div>
                  </div>
                ))
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

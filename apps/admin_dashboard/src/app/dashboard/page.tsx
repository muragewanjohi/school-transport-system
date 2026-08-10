"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Plus,
  Play,
  Users,
  Bus,
  Clock,
  Bell,
  CheckCircle2,
  Info,
  Wrench,
  Building2,
  Route as RouteIcon,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { ThemeToggle } from "@/components/ThemeProvider";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

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

const LIGHT_MAP_STYLES: unknown[] = [];
const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
];

export default function DashboardPage() {
  const [busesActive, setBusesActive] = useState(3);
  const [boardedCount, setBoardedCount] = useState(0);
  const [alertCount, setAlertCount] = useState(48);
  const [sosCount, setSosCount] = useState(0);
  const [impersonating, setImpersonating] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [schoolName, setSchoolName] = useState("School Dashboard");

  const [students, setStudents] = useState<DBStudent[]>([]);
  const [stops, setStops] = useState<DBStop[]>([]);
  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [tripCounts, setTripCounts] = useState({
    completed: 0,
    ongoing: 0,
    scheduled: 0,
  });

  const [events, setEvents] = useState<TelemetryEvent[]>([
    {
      id: "1",
      time: "07:28:12 AM",
      route: "Morning Route 2",
      type: "success",
      message: "SMS Alert Dispatched via Africa's Talking -> +254 703 *** 122",
    },
    {
      id: "2",
      time: "07:28:10 AM",
      route: "Morning Route 2",
      type: "info",
      message: "Bus entered pickup geofence (Elsa's Home)",
    },
    {
      id: "3",
      time: "07:26:01 AM",
      route: "Morning Route 4",
      type: "success",
      message: "Student (James Omondi) Boarded via NFC Card Tap",
    },
    {
      id: "4",
      time: "07:24:14 AM",
      route: "Morning Route 4",
      type: "error",
      message: "Bus 7 exceeded speed limit",
    },
    {
      id: "5",
      time: "07:24:12 AM",
      route: "Morning Route 4",
      type: "info",
      message: "Bus entered pickup geofence (James's Home)",
    },
  ]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const opsRef = useRef<HTMLDivElement>(null);
  const simulationStopIndexRef = useRef<number>(0);

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

      const savedSchools = localStorage.getItem("safaricom_school_locations");
      let schoolLocations = [
        {
          id: "school-loc-1",
          name: "School Campus",
          latitude: -1.2921,
          longitude: 36.8219,
        },
      ];
      if (savedSchools) {
        try {
          const parsed = JSON.parse(savedSchools);
          if (Array.isArray(parsed) && parsed.length > 0) {
            schoolLocations = parsed;
          }
        } catch (e) {
          console.error("Failed to parse school locations:", e);
        }
      }

      schoolLocations.forEach((loc) => {
        if (!isMounted || !mapRef.current) return;

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

      const defaultBuses = [
        { id: "bus-4", name: "KBZ 445B (Morning Run)", lat: -1.2721, lng: 36.7981 },
        { id: "bus-2", name: "KCD 542A (Morning Run)", lat: -1.2699, lng: 36.8115 },
        { id: "bus-1", name: "KBC 104D (Parked)", lat: -1.2612, lng: 36.8021 },
      ];

      defaultBuses.forEach((bus) => {
        if (!isMounted || !mapRef.current) return;

        const busMarker = new window.google.maps.Marker({
          position: { lat: bus.lat, lng: bus.lng },
          map: map,
          title: bus.name,
          icon: {
            url: "/assets/bus-icon.png",
            scaledSize: new window.google.maps.Size(46, 46),
            origin: new window.google.maps.Point(0, 0),
            anchor: new window.google.maps.Point(23, 23),
          },
        });

        markersRef.current[bus.id] = busMarker;
      });
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

          const newEvent: TelemetryEvent = {
            id: record.id || Date.now().toString(),
            time: newTime,
            route: `Route ${record.route_id?.slice(0, 4) || "Live"}`,
            type: "info",
            message: `DB Live Feed: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)} (${speedVal})`,
          };

          setEvents((prev) => [newEvent, ...prev.slice(0, 15)]);
          setAlertCount((prev) => prev + 1);

          const key = record.vehicle_id || "bus-4";
          if (markersRef.current[key] && mapRef.current) {
            markersRef.current[key].setPosition({ lat, lng });
            mapRef.current.panTo({ lat, lng });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [stopsRes, routesRes, studentsRes, configRes, tripsRes] = await Promise.all([
          fetch("/api/stops"),
          fetch("/api/routes"),
          fetch("/api/students"),
          fetch("/api/config"),
          fetch("/api/trips"),
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
            scheduled: scheduled || trips.length,
          });
          if (ongoing > 0) setBusesActive(ongoing);
        }
      } catch (err) {
        console.error("Failed to load dashboard overview data:", err);
      }
    };
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!opsRef.current?.contains(e.target as Node)) {
        setOpsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSimulateGPS = async () => {
    let lat = -1.2721;
    let lng = 36.8045;
    let stopName = "";
    let smsEvents: TelemetryEvent[] = [];

    const activeRouteId = stops.length > 0 ? stops[0].route_id : "route-4";
    let chosenRouteName = "Morning Route 4";
    const matchedRoute = routes.find((r) => r.id === activeRouteId);
    if (matchedRoute) {
      chosenRouteName = matchedRoute.name;
    }

    const routeStops = stops
      .filter((s) => s.route_id === activeRouteId)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    if (routeStops.length > 0) {
      const idx = simulationStopIndexRef.current % routeStops.length;
      simulationStopIndexRef.current += 1;

      const targetStop = routeStops[idx];
      lng = targetStop.location?.coordinates?.[0] ?? lng;
      lat = targetStop.location?.coordinates?.[1] ?? lat;
      stopName = targetStop.name;

      const nextStop = routeStops[idx + 1];
      if (nextStop) {
        const nextStopStudents = students.filter(
          (s) =>
            s.route_id === activeRouteId &&
            (s.pickup_stop_id === nextStop.id || s.dropoff_stop_id === nextStop.id)
        );

        nextStopStudents.forEach((student) => {
          const parent = student.guardians && student.guardians[0];
          const parentPhone = parent ? parent.phone : "+254703000122";

          smsEvents.push({
            id: `sms-${student.id}-${Date.now()}-${Math.random()}`,
            time: new Date().toLocaleTimeString("en-US", { hour12: true }),
            route: chosenRouteName,
            type: "success",
            message: `SMS alert sent to ${student.name}'s parent -> ${parentPhone}`,
          });
        });
      }
    } else {
      lat = -1.2721 + (Math.random() * 0.02 - 0.01);
      lng = 36.8045 + (Math.random() * 0.02 - 0.01);
    }

    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });

    const geofenceEvent: TelemetryEvent = {
      id: `geo-${Date.now()}`,
      time: newTime,
      route: chosenRouteName,
      type: "info",
      message: stopName
        ? `Bus entered geofence: ${stopName}`
        : `Telemetry ping: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`,
    };

    setEvents((prev) => [...smsEvents, geofenceEvent, ...prev].slice(0, 15));
    setAlertCount((prev) => prev + smsEvents.length);

    if (markersRef.current["bus-4"] && mapRef.current) {
      markersRef.current["bus-4"].setPosition({ lat, lng });
      mapRef.current.panTo({ lat, lng });
    }

    if (isSupabaseConfigured) {
      try {
        await fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicle_id: "8c9ad841-f762-4217-a021-9876251b5bcf",
            route_id: activeRouteId,
            latitude: lat,
            longitude: lng,
            speed: Math.floor(Math.random() * 25) + 20,
            bearing: Math.floor(Math.random() * 360),
          }),
        });
      } catch (err) {
        console.error("Failed to post simulation telemetry payload:", err);
      }
    }
    setOpsOpen(false);
  };

  const handleSimulateNFC = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    const studentsList = ["Fatuma Ali", "Brian Koech", "Mary Mwangi", "James Omondi"];
    const chosenStudent = studentsList[Math.floor(Math.random() * studentsList.length)];

    setBoardedCount((prev) => prev + 1);

    setEvents((prev) => [
      {
        id: Date.now().toString(),
        time: newTime,
        route: "Morning Route 4",
        type: "success",
        message: `Student (${chosenStudent}) Checked-In successfully via NFC tap`,
      },
      ...prev.slice(0, 15),
    ]);
    setOpsOpen(false);
  };

  const handleTriggerSOS = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    setSosCount((prev) => prev + 1);

    setEvents((prev) => [
      {
        id: Date.now().toString(),
        time: newTime,
        route: "Morning Route 2",
        type: "error",
        message: "CRITICAL: Driver triggered SOS Alert coordinates streamed!",
      },
      ...prev.slice(0, 15),
    ]);

    if (markersRef.current["bus-4"] && mapRef.current) {
      const sosLat = -1.2652;
      const sosLng = 36.8122;
      markersRef.current["bus-4"].setPosition({ lat: sosLat, lng: sosLng });
      mapRef.current.panTo({ lat: sosLat, lng: sosLng });
      mapRef.current.setZoom(15);
    }
    setOpsOpen(false);
  };

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

  const scheduledTrips =
    tripCounts.scheduled || tripCounts.completed + tripCounts.ongoing || routes.length || 0;
  const completedTrips = tripCounts.completed || Math.max(scheduledTrips - busesActive, 0);
  const ongoingTrips = tripCounts.ongoing || busesActive;

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
            {impersonating && (
              <span
                style={{
                  background: "rgba(244,63,94,0.1)",
                  color: "var(--state-error)",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  border: "1px solid rgba(244,63,94,0.2)",
                }}
              >
                Impersonation Mode (Read-Only)
              </span>
            )}
          </div>

          <div className="top-bar-actions">
            <div className="ops-tools" ref={opsRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpsOpen((v) => !v)}
                aria-label="Ops tools"
                title="Ops tools"
              >
                <Wrench size={16} />
              </button>
              {opsOpen && (
                <div className="ops-tools-menu">
                  <button type="button" onClick={handleSimulateGPS}>
                    <Play size={14} /> Simulate GPS Ping
                  </button>
                  <button type="button" onClick={handleSimulateNFC}>
                    <Plus size={14} /> Simulate NFC Tap
                  </button>
                  <button type="button" onClick={handleTriggerSOS}>
                    <AlertCircle size={14} /> Trigger SOS
                  </button>
                  <button type="button" onClick={() => setImpersonating((p) => !p)}>
                    <Users size={14} /> Toggle Support Mode
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="icon-btn" aria-label="Notifications">
              <Bell size={16} />
              {(alertCount > 0 || sosCount > 0) && (
                <span className="icon-btn-badge">{Math.min(sosCount || 3, 99)}</span>
              )}
            </button>
            <ThemeToggle className="theme-toggle-compact" />
            <UserProfileBadge
              nameOverride={impersonating ? "Platform Support Team" : undefined}
              roleOverride={impersonating ? "Super Administrator" : undefined}
              initialsOverride={impersonating ? "PS" : undefined}
            />
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
                  <span className="dash-dot moving" /> Moving: {Math.max(busesActive - 1, 0)}
                </span>
                <span className="dash-legend-item">
                  <span className="dash-dot stopped" /> Stopped: 1
                </span>
                <span className="dash-legend-item">
                  <span className="dash-dot idle" /> Idle: {Math.max(3 - busesActive, 0)}
                </span>
                <span className="dash-legend-item">
                  <span className="dash-dot offline" /> Offline: 0
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
                {events.slice(0, 6).map((event) => (
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
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Compass, 
  Rss, 
  AlertCircle, 
  Plus, 
  Play, 
  Sparkles,
  Search,
  X,
  Users,
  Phone,
  CreditCard,
  MapPin,
  User
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import UserProfileBadge from "@/components/UserProfileBadge";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

declare global {
  interface Window {
    google: any;
    initGoogleMapsDashboard?: () => void;
  }
}

const PREDEFINED_LOCATIONS = [
  { id: "loc-1", name: "Kileleshwa stop (Githunguri Road)", coordinates: [36.7889, -1.2789] },
  { id: "loc-2", name: "Westlands stop (Mwanzi Road)", coordinates: [36.8085, -1.2645] },
  { id: "loc-3", name: "Kilimani stop (Chania Avenue)", coordinates: [36.7915, -1.2941] },
  { id: "loc-4", name: "Lavington stop (James Gichuru)", coordinates: [36.7725, -1.2852] },
  { id: "loc-5", name: "Langata stop (Kenyatta Market)", coordinates: [36.8045, -1.3142] },
  { id: "loc-6", name: "South C stop (Mugoya Estate)", coordinates: [36.8295, -1.3211] },
  { id: "loc-7", name: "Karen stop (Hardy Shopping Center)", coordinates: [36.7495, -1.3392] },
  { id: "loc-8", name: "CBD stop (GPO Bus Stop)", coordinates: [36.8192, -1.2845] },
];

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

export default function Home() {
  // Simulator State
  const [busesActive, setBusesActive] = useState(4);
  const [boardedCount, setBoardedCount] = useState(142);
  const [alertCount, setAlertCount] = useState(48);
  const [sosCount, setSosCount] = useState(0);
  const [radarOffset, setRadarOffset] = useState({ x: 0, y: 0 });
  const [impersonating, setImpersonating] = useState(false);

  // Student manifest state & filters
  const [students, setStudents] = useState<DBStudent[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [classFilter, setClassFilter] = useState("All");

  const findStopNameById = (stopId: string | null | undefined) => {
    if (!stopId) return "Standby stop (Unassigned)";
    const stop = stops.find(s => s.id === stopId);
    return stop ? stop.name : "Unknown Stop";
  };

  const [events, setEvents] = useState<TelemetryEvent[]>([
    {
      id: "1",
      time: "07:28:12 AM",
      route: "Morning Route 2",
      type: "success",
      message: "SMS Alert Dispatched via Africa's Talking -> +254 703 *** 122"
    },
    {
      id: "2",
      time: "07:28:10 AM",
      route: "Morning Route 2",
      type: "info",
      message: "Bus entered pickup geofence (Elsa's Home)"
    },
    {
      id: "3",
      time: "07:26:01 AM",
      route: "Morning Route 4",
      type: "success",
      message: "Student (James Omondi) Boarded via NFC Card Tap"
    },
    {
      id: "4",
      time: "07:24:14 AM",
      route: "Morning Route 4",
      type: "success",
      message: "SMS Alert Dispatched via Africa's Talking -> +254 712 *** 789"
    },
    {
      id: "5",
      time: "07:24:12 AM",
      route: "Morning Route 4",
      type: "info",
      message: "Bus entered pickup geofence (James's Home)"
    }
  ]);

  // Google Maps DOM mounting reference and map/marker state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // Fetch routes and initialize Google Maps on the client
  useEffect(() => {
    let isMounted = true;

    const initMap = () => {
      if (!mapContainerRef.current || !window.google || !window.google.maps) return;

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: -1.2721, lng: 36.8045 }, // Nairobi center
        zoom: 13,
        mapTypeId: "roadmap",
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
        ],
      });

      mapRef.current = map;

      // Fetch and draw student transit routes as Google Polylines
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

      // Load configured school locations
      const savedSchools = localStorage.getItem("safaricom_school_locations");
      let schoolLocations = [
        { id: "school-loc-1", name: "St. Mary's Academy (Upper School)", latitude: -1.2921, longitude: 36.8219 },
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

      // Render school markers on Google Map
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

      // Initialize default active bus markers
      const defaultBuses = [
        { id: "bus-4", name: "KBZ 445B (Morning Run)", color: "#10B981", lat: -1.2721, lng: 36.7981 },
        { id: "bus-2", name: "KCD 542A (Morning Run)", color: "#6366F1", lat: -1.2699, lng: 36.8115 },
        { id: "bus-1", name: "KBC 104D (Parked)", color: "#64748B", lat: -1.2612, lng: 36.8021 },
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

  // Subscribe to real-time database updates from Supabase
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

          // Update Google Maps bus marker position
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

  // Fetch student, stops and schedules records
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const res = await fetch("/api/students");
        const json = await res.json();
        if (json.success) {
          setStudents(json.data);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
      }
    };

    const fetchDashboardData = async () => {
      try {
        // Fetch stops
        const stopsRes = await fetch("/api/stops");
        const stopsJson = await stopsRes.json();
        if (stopsJson.success) {
          setStops(stopsJson.data);
        }

        // Fetch schedules
        const schedulesRes = await fetch("/api/schedules");
        const schedulesJson = await schedulesRes.json();
        if (schedulesJson.success) {
          setSchedules(schedulesJson.data);
        }

        // Fetch routes
        const routesRes = await fetch("/api/routes");
        const routesJson = await routesRes.json();
        if (routesJson.success) {
          setRoutes(routesJson.data);
        }

        // Fetch students
        await fetchStudents();
      } catch (err) {
        console.error("Failed to load dashboard overview data:", err);
      }
    };
    fetchDashboardData();
  }, []);

  const handleToggleStatus = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const newStatus = student.status === "Present" ? "Absent" : "Present";
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const json = await res.json();
      if (json.success) {
        const studentsRes = await fetch("/api/students");
        const studentsJson = await studentsRes.json();
        if (studentsJson.success) {
          setStudents(studentsJson.data);
        }
      }
    } catch (err) {
      console.error("Failed to sync student status toggle:", err);
    }
  };

  // Simulation Tracker Ref
  const simulationStopIndexRef = useRef<number>(0);

  // Simulation Trigger Handlers
  const handleSimulateGPS = async () => {
    // Generate default coordinates near Nairobi center
    let lat = -1.2721;
    let lng = 36.8045;
    let stopName = "";
    let nextStopName = "";
    let etaMins = 0;
    let etaStr = "";
    let smsEvents: TelemetryEvent[] = [];
    
    // Choose route for simulation
    const activeRouteId = stops.length > 0 ? stops[0].route_id : "route-4";
    let chosenRouteName = "Morning Route 4";
    const matchedRoute = routes.find(r => r.id === activeRouteId);
    if (matchedRoute) {
      chosenRouteName = matchedRoute.name;
    }

    // Filter stops on the active simulation route, sorted by sequence number
    const routeStops = stops
      .filter(s => s.route_id === activeRouteId)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    if (routeStops.length > 0) {
      const idx = simulationStopIndexRef.current % routeStops.length;
      simulationStopIndexRef.current += 1;
      
      const targetStop = routeStops[idx];
      lng = targetStop.location.coordinates[0];
      lat = targetStop.location.coordinates[1];
      stopName = targetStop.name;
      
      // Determine if there is a next stop in sequence
      const nextStop = routeStops[idx + 1];
      if (nextStop) {
        nextStopName = nextStop.name;
        // Travel duration in seconds from previous stop
        const durationSec = nextStop.duration_from_prev_seconds || 300; // default 5 mins
        etaMins = Math.round(durationSec / 60);
        if (etaMins <= 0) etaMins = 5;

        const now = new Date();
        const etaTime = new Date(now.getTime() + durationSec * 1000);
        etaStr = etaTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

        // Find students assigned to this next stop
        const nextStopStudents = students.filter(s => 
          s.route_id === activeRouteId && 
          (s.pickup_stop_id === nextStop.id || s.dropoff_stop_id === nextStop.id)
        );

        nextStopStudents.forEach(student => {
          const parent = student.guardians && student.guardians[0];
          const parentPhone = parent ? parent.phone : "+254703000122";
          
          const smsEvent: TelemetryEvent = {
            id: `sms-${student.id}-${Date.now()}-${Math.random()}`,
            time: new Date().toLocaleTimeString("en-US", { hour12: true }),
            route: chosenRouteName,
            type: "success",
            message: `SMS alert sent to ${student.name}'s parent -> ${parentPhone}`
          };
          smsEvents.push(smsEvent);
        });
      }
    } else {
      // Fallback if no stops found
      lat = -1.2721 + (Math.random() * 0.02 - 0.01);
      lng = 36.8045 + (Math.random() * 0.02 - 0.01);
    }
    
    // Animate local state radar offset (for simulated view)
    const randomX = Math.floor(Math.random() * 80) - 40;
    const randomY = Math.floor(Math.random() * 80) - 40;
    setRadarOffset({ x: randomX, y: randomY });

    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    
    const geofenceEvent: TelemetryEvent = {
      id: `geo-${Date.now()}`,
      time: newTime,
      route: chosenRouteName,
      type: "info",
      message: stopName 
        ? `Bus entered geofence: ${stopName}`
        : `Telemetry ping: Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`
    };

    // Prepend new events (geofence entry + SMS dispatches)
    setEvents(prev => [...smsEvents, geofenceEvent, ...prev].slice(0, 15));
    setAlertCount(prev => prev + smsEvents.length);

    // Update active Google Maps marker for "bus-4" if map is active
    if (markersRef.current["bus-4"] && mapRef.current) {
      markersRef.current["bus-4"].setPosition({ lat, lng });
      mapRef.current.panTo({ lat, lng });
    }

    // Try posting to API database backend if Supabase variables exist
    if (isSupabaseConfigured) {
      try {
        await fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicle_id: "8c9ad841-f762-4217-a021-9876251b5bcf", // Mock vehicle UUID
            route_id: activeRouteId,
            latitude: lat,
            longitude: lng,
            speed: Math.floor(Math.random() * 25) + 20,
            bearing: Math.floor(Math.random() * 360)
          })
        });
      } catch (err) {
        console.error("Failed to post simulation telemetry payload:", err);
      }
    }
  };

  const handleSimulateNFC = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    const students = ["Fatuma Ali", "Brian Koech", "Mary Mwangi", "James Omondi"];
    const chosenStudent = students[Math.floor(Math.random() * students.length)];
    
    if (boardedCount < 150) {
      setBoardedCount(prev => prev + 1);
    }

    const newEvent: TelemetryEvent = {
      id: Date.now().toString(),
      time: newTime,
      route: "Morning Route 4",
      type: "success",
      message: `Student (${chosenStudent}) Checked-In successfully via NFC tap`
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 15)]);
  };

  const handleTriggerSOS = () => {
    const newTime = new Date().toLocaleTimeString("en-US", { hour12: true });
    setSosCount(prev => prev + 1);

    const newEvent: TelemetryEvent = {
      id: Date.now().toString(),
      time: newTime,
      route: "Morning Route 2",
      type: "error",
      message: "CRITICAL: Driver triggered SOS Alert coordinates streamed!"
    };

    setEvents(prev => [newEvent, ...prev.slice(0, 15)]);

    // Relocate active bus in Google Maps to signify SOS location
    if (markersRef.current["bus-4"] && mapRef.current) {
      const sosLat = -1.2652;
      const sosLng = 36.8122;
      
      markersRef.current["bus-4"].setPosition({ lat: sosLat, lng: sosLng });
      mapRef.current.panTo({ lat: sosLat, lng: sosLng });
      mapRef.current.setZoom(15);
    }
  };

  // Get unique grades and classes for filter dropdowns
  const uniqueGrades = Array.from(new Set(students.map(s => s.grade).filter(Boolean))).sort() as string[];
  const uniqueClasses = Array.from(new Set(students.map(s => s.class_name).filter(Boolean))).sort() as string[];

  // Filtered Students List
  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase();
    const pickupName = findStopNameById(student.pickup_stop_id).toLowerCase();
    const dropoffName = findStopNameById(student.dropoff_stop_id).toLowerCase();
    const routeName = (student.route?.name || "").toLowerCase();
    const grade = (student.grade || "").toLowerCase();
    const className = (student.class_name || "").toLowerCase();
    
    // Check grade filter
    if (gradeFilter !== "All" && student.grade !== gradeFilter) return false;
    
    // Check class filter
    if (classFilter !== "All" && student.class_name !== classFilter) return false;
    
    const matchesGuardians = student.guardians?.some(g => 
      g.name.toLowerCase().includes(query) || 
      g.phone.includes(query)
    );
    
    return (
      student.name.toLowerCase().includes(query) ||
      routeName.includes(query) ||
      pickupName.includes(query) ||
      dropoffName.includes(query) ||
      (student.nfc_card_hash || "").toLowerCase().includes(query) ||
      matchesGuardians ||
      grade.includes(query) ||
      className.includes(query)
    );
  });

  return (
    <div className="app-container">
      <Sidebar />

      <style jsx global>{`
        .student-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .student-table th {
          text-align: left;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-default);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .student-table td {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          vertical-align: middle;
        }
        .student-table tr:hover {
          background: rgba(255, 255, 255, 0.01);
        }
        .student-avatar {
          width: 40px;
          height: 40px;
          background: rgba(99, 102, 241, 0.1);
          color: var(--accent-secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1rem;
        }
        .switch-container {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
          margin-top: 4px;
        }
        .switch-track {
          width: 36px;
          height: 20px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-default);
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .switch-track.Present {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
        }
        .switch-track.Absent {
          background: rgba(244, 63, 94, 0.1);
          border-color: rgba(244, 63, 94, 0.4);
        }
        .switch-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .switch-track.Present .switch-thumb {
          transform: translateX(16px);
          background: var(--state-success);
        }
        .switch-track.Absent .switch-thumb {
          transform: translateX(0);
          background: var(--text-muted);
        }
        .switch-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .switch-label.Present {
          color: var(--state-success);
        }
        .switch-label.Absent {
          color: var(--state-error);
        }
      `}</style>

      {/* Main Panel Content */}
      <main className="main-content">
        {/* Top Header Section */}
        <header className="top-bar">
          <div>
            <span className="top-bar-title">St. Mary's Academy Command Center</span>
            {impersonating && (
              <span style={{ 
                marginLeft: "12px", 
                background: "rgba(244,63,94,0.1)", 
                color: "var(--state-error)", 
                padding: "3px 8px", 
                borderRadius: "4px", 
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "1px solid rgba(244,63,94,0.2)"
              }}>
                Impersonation Mode (Read-Only)
              </span>
            )}
          </div>
          <div className="user-profile">
            <button 
              onClick={() => setImpersonating(prev => !prev)}
              style={{
                background: "rgba(99,102,241,0.1)",
                color: "var(--accent-secondary)",
                border: "1px solid rgba(99,102,241,0.2)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                marginRight: "16px"
              }}
            >
              Toggle Support Mode
            </button>
            <UserProfileBadge 
              nameOverride={impersonating ? "Platform Support Team" : undefined}
              roleOverride={impersonating ? "Super Administrator" : undefined}
              initialsOverride={impersonating ? "PS" : undefined}
            />
          </div>
        </header>

        {/* Dynamic Metric Counter Panels */}
        <section className="dashboard-grid">
          <div className="stat-card primary">
            <div className="stat-label">Buses Active</div>
            <div className="stat-value">{busesActive} / 5</div>
            <div className="stat-desc">Morning trips in progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Students Checked-in</div>
            <div className="stat-value">{boardedCount} / 150</div>
            <div className="stat-desc">Boarded via NFC badge taps</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Proximity Alerts Sent</div>
            <div className="stat-value">{alertCount}</div>
            <div className="stat-desc">SMS dispatches via Africa's Talking</div>
          </div>
          <div className="stat-card error">
            <div className="stat-label">Emergency Panic SOS</div>
            <div className="stat-value">{sosCount}</div>
            <div className="stat-desc" style={{ color: sosCount > 0 ? "var(--state-error)" : "var(--text-muted)" }}>
              {sosCount > 0 ? "Urgent coordinates received" : "All routes normal & secure"}
            </div>
          </div>
        </section>

        {/* Dashboard split viewport */}
        <section className="dashboard-content-layout">
          {/* Map Viewport & Controls */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <Compass size={18} style={{ color: "var(--accent-primary)" }} />
                Live Fleet telemetry (Nairobi Sector)
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button 
                  onClick={handleSimulateGPS}
                  style={{
                    background: "rgba(16,185,129,0.1)",
                    color: "var(--accent-primary)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Play size={12} />
                  Simulate GPS Ping
                </button>
                <button 
                  onClick={handleSimulateNFC}
                  style={{
                    background: "rgba(99,102,241,0.1)",
                    color: "var(--accent-secondary)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Plus size={12} />
                  Simulate NFC Tap
                </button>
                <button 
                  onClick={handleTriggerSOS}
                  style={{
                    background: "rgba(244,63,94,0.1)",
                    color: "var(--state-error)",
                    border: "1px solid rgba(244,63,94,0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <AlertCircle size={12} />
                  Trigger SOS
                </button>
              </div>
            </div>

            {/* Map Element */}
            <div 
              ref={mapContainerRef} 
              className="map-placeholder"
              style={{ height: "380px", position: "relative" }}
            />
            
            <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              <Sparkles size={14} style={{ color: "var(--accent-secondary)" }} />
              <span>Click the simulation buttons above to trigger live coordinate streams and check-in manifest entries.</span>
            </div>
          </div>

          {/* Live Telemetry Log Feed Panel */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">
                <Rss size={18} style={{ color: "var(--accent-secondary)" }} />
                Real-Time Telemetry Feed
              </span>
            </div>

            <div className="telemetry-list">
              {events.map(event => (
                <div className="telemetry-item" key={event.id}>
                  <div className="telemetry-meta">
                    <span className="telemetry-title">{event.message}</span>
                    <span className="telemetry-subtitle">
                      {event.time} • {event.route}
                    </span>
                  </div>
                  <span className={`telemetry-badge ${event.type}`}>
                    {event.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Student Manifest Overview Panel */}
        <section className="dashboard-content-layout" style={{ gridTemplateColumns: "1fr", marginTop: "24px" }}>
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ border: "none", margin: 0, paddingBottom: "16px" }}>
              <span className="panel-title" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                <Users size={20} style={{ color: "var(--accent-primary)" }} />
                Student Manifests Overview
              </span>
            </div>

            {/* Filter controls */}
            <div style={{
              display: "flex",
              gap: "12px",
              marginBottom: "16px",
              flexWrap: "wrap"
            }}>
              {/* Search Bar */}
              <div style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "8px 14px",
                gap: "8px",
                flex: 2,
                minWidth: "240px"
              }}>
                <Search size={16} style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search by student name, route, grade, class..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    width: "100%"
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Grade Dropdown Selector */}
              <div style={{ flex: 1, minWidth: "150px" }}>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  style={{
                    background: "rgba(6, 9, 19, 0.6)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer"
                  }}
                >
                  <option value="All">All Grades</option>
                  {uniqueGrades.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Class Dropdown Selector */}
              <div style={{ flex: 1, minWidth: "150px" }}>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  style={{
                    background: "rgba(6, 9, 19, 0.6)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer"
                  }}
                >
                  <option value="All">All Classes</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Student manifest list / table */}
            {filteredStudents.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "160px", color: "var(--text-muted)", border: "1px dashed var(--border-default)", borderRadius: "12px" }}>
                <span>No student manifests found matching active filters.</span>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Attendance Status</th>
                      <th>Transit Route</th>
                      <th>Pickup & Drop-off Stops</th>
                      <th>Parents & Guardians</th>
                      <th>NFC Tag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(student => {
                      const initials = student.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                      const pickupName = findStopNameById(student.pickup_stop_id);
                      const dropoffName = findStopNameById(student.dropoff_stop_id);

                      return (
                        <tr key={student.id}>
                          {/* Student Name & Subtitle */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div className="student-avatar">{initials}</div>
                              <div>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)", display: "block" }}>{student.name}</span>
                                {(student.grade || student.class_name) && (
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                                    {student.grade || ""}{student.grade && student.class_name ? ` • ` : ""}{student.class_name || ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Attendance Switch Toggle */}
                          <td>
                            <div className="switch-container" onClick={() => handleToggleStatus(student.id)}>
                              <div className={`switch-track ${student.status}`} title="Click to toggle status">
                                <div className="switch-thumb" />
                              </div>
                              <span className={`switch-label ${student.status}`} style={{ minWidth: "50px" }}>
                                {student.status}
                              </span>
                            </div>
                          </td>

                          {/* Route */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-primary)" }}>
                              <Compass size={14} style={{ color: "var(--accent-secondary)" }} />
                              <span style={{ fontWeight: 500 }}>{student.route?.name || "Unassigned"}</span>
                            </div>
                          </td>

                          {/* Stops */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}>
                                <MapPin size={12} style={{ color: "var(--state-success)" }} />
                                <span style={{ color: "var(--text-primary)" }}>{pickupName}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}>
                                <MapPin size={12} style={{ color: "var(--state-warning)" }} />
                                <span style={{ color: "var(--text-primary)" }}>{dropoffName}</span>
                              </div>
                            </div>
                          </td>

                          {/* Guardians */}
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {student.guardians && student.guardians.map((g, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "0.8rem" }}>
                                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{g.name}</span>
                                  <a href={`tel:${g.phone}`} style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "2px", fontSize: "0.75rem" }}>
                                    <Phone size={8} /> {g.phone}
                                  </a>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* NFC Card */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <CreditCard size={14} style={{ color: student.nfc_card_hash ? "var(--state-success)" : "var(--text-muted)" }} />
                              {student.nfc_card_hash ? (
                                <code style={{ fontSize: "0.75rem", color: "var(--state-success)" }}>{student.nfc_card_hash}</code>
                              ) : (
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>None</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
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
  Edit,
  GripVertical
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useSearchParams, useRouter } from "next/navigation";
import type mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface DBRoute {
  id: string;
  name: string;
  vehicle_id?: string | null;
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
  distance_from_prev_meters?: number;
  duration_from_prev_seconds?: number;
}

interface DBSchedule {
  id: string;
  route_id: string;
  name: string;
  departure_time: string;
  direction: "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";
  target_grades: string[];
  days_of_week: number[];
  vehicle_id?: string | null;
}

interface SchoolLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

function RoutesManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");

  const [routes, setRoutes] = useState<DBRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [stops, setStops] = useState<DBStop[]>([]);
  const [schedules, setSchedules] = useState<DBSchedule[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stops" | "schedules" | "schools">("stops");

  useEffect(() => {
    if (tabParam === "schools" || tabParam === "stops" || tabParam === "schedules") {
      setActiveTab(tabParam as any);
    } else {
      setActiveTab("stops");
    }
  }, [tabParam]);

  // Drawer modal states
  const [showStopDrawer, setShowStopDrawer] = useState(false);
  const [showScheduleDrawer, setShowScheduleDrawer] = useState(false);
  const [showRouteDrawer, setShowRouteDrawer] = useState(false);
  const [showEditRouteDrawer, setShowEditRouteDrawer] = useState(false);
  const [editRouteId, setEditRouteId] = useState("");
  const [editRouteName, setEditRouteName] = useState("");
  const [routeName, setRouteName] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // School configuration
  const [schoolLocations, setSchoolLocations] = useState<SchoolLocation[]>([
    { id: "school-loc-1", name: "St. Mary's Academy (Upper School)", latitude: -1.2921, longitude: 36.8219 }
  ]);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [schoolDrawerMode, setSchoolDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditSchoolId, setCurrentEditSchoolId] = useState<string | null>(null);
  const [tempSchoolConfig, setTempSchoolConfig] = useState({
    name: "St. Mary's Academy",
    latitude: -1.2921,
    longitude: 36.8219
  });
  const [startSchoolId, setStartSchoolId] = useState("");
  const [endSchoolId, setEndSchoolId] = useState("");
  const [schoolSuggestions, setSchoolSuggestions] = useState<any[]>([]);
  const [showSchoolSuggestions, setShowSchoolSuggestions] = useState(false);
  const [isSearchingSchool, setIsSearchingSchool] = useState(false);

  const handleStartEditSchool = (loc: SchoolLocation) => {
    setTempSchoolConfig({
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude
    });
    setSchoolDrawerMode("edit");
    setCurrentEditSchoolId(loc.id);
    setShowSchoolModal(true);
  };

  const handleDeleteSchool = (id: string) => {
    if (schoolLocations.length <= 1) {
      alert("At least one school location is required.");
      return;
    }
    if (!confirm("Are you sure you want to delete this school location?")) return;
    
    const updated = schoolLocations.filter(loc => loc.id !== id);
    setSchoolLocations(updated);
    localStorage.setItem("safaricom_school_locations", JSON.stringify(updated));
  };

  const handleSaveSchool = () => {
    if (!tempSchoolConfig.name.trim()) {
      alert("School name is required.");
      return;
    }
    
    let updated: SchoolLocation[];
    if (schoolDrawerMode === "edit" && currentEditSchoolId) {
      updated = schoolLocations.map(loc => 
        loc.id === currentEditSchoolId 
          ? { ...loc, name: tempSchoolConfig.name, latitude: tempSchoolConfig.latitude, longitude: tempSchoolConfig.longitude }
          : loc
      );
    } else {
      const newLoc: SchoolLocation = {
        id: `school-loc-${Date.now()}`,
        name: tempSchoolConfig.name,
        latitude: tempSchoolConfig.latitude,
        longitude: tempSchoolConfig.longitude
      };
      updated = [...schoolLocations, newLoc];
    }
    
    setSchoolLocations(updated);
    localStorage.setItem("safaricom_school_locations", JSON.stringify(updated));
    setShowSchoolModal(false);
  };

  // Autosearch and draggable pin marker states/refs
  const [stopSuggestions, setStopSuggestions] = useState<any[]>([]);
  const [showSuggestionsList, setShowSuggestionsList] = useState(false);
  const [isSearchingStops, setIsSearchingStops] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");
  const draggableMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const draggableSchoolMarkerRef = useRef<mapboxgl.Marker | null>(null);

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
    setSearchLocation(stop.name);
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
      days_of_week: sched.days_of_week || [1, 2, 3, 4, 5],
      vehicle_id: sched.vehicle_id || ""
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
    days_of_week: [1, 2, 3, 4, 5],
    vehicle_id: ""
  });

  // Mapbox references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const lastCoordsQueryRef = useRef<string>("");

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const hasMapboxToken = typeof mapboxToken === "string" && mapboxToken.trim().length > 0;

  // DRAGGABLE MARKER INITIALIZER
  const initializeDraggableMarker = async (lng: number, lat: number) => {
    if (!mapRef.current) return;
    const mapboxglModule = (await import("mapbox-gl")).default;
    
    // Check again after async import to ensure component wasn't unmounted/map removed
    if (!mapRef.current) return;

    if (draggableMarkerRef.current) {
      draggableMarkerRef.current.remove();
      draggableMarkerRef.current = null;
    }

    // Create a beautiful custom teardrop marker
    const el = document.createElement("div");
    el.className = "draggable-place-marker";
    el.style.width = "30px";
    el.style.height = "30px";
    el.style.borderRadius = "50% 50% 50% 0";
    el.style.background = "#f59e0b"; // amber-500
    el.style.border = "2px solid #ffffff";
    el.style.transform = "rotate(-45deg)";
    el.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    el.style.cursor = "move";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";

    const inner = document.createElement("div");
    inner.style.width = "10px";
    inner.style.height = "10px";
    inner.style.background = "#0c1122";
    inner.style.borderRadius = "50%";
    inner.style.transform = "rotate(45deg)";
    el.appendChild(inner);

    const marker = new mapboxglModule.Marker({
      element: el,
      draggable: true,
      anchor: "bottom"
    })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      setStopForm(prev => ({
        ...prev,
        longitude: parseFloat(lngLat.lng.toFixed(6)),
        latitude: parseFloat(lngLat.lat.toFixed(6))
      }));
    });

    draggableMarkerRef.current = marker;

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      essential: true
    });
  };

  // Draggable marker lifecycle syncing with Stop Onboard Drawer
  useEffect(() => {
    if (showStopDrawer && mapRef.current) {
      const timer = setTimeout(() => {
        initializeDraggableMarker(stopForm.longitude, stopForm.latitude);
      }, 400);

      const handleMapClick = (e: any) => {
        const lngLat = e.lngLat;
        if (!lngLat) return;
        const lng = parseFloat(lngLat.lng.toFixed(6));
        const lat = parseFloat(lngLat.lat.toFixed(6));
        
        setStopForm(prev => ({
          ...prev,
          longitude: lng,
          latitude: lat
        }));

        if (draggableMarkerRef.current) {
          draggableMarkerRef.current.setLngLat([lng, lat]);
        }
      };

      mapRef.current.on("click", handleMapClick);

      return () => {
        clearTimeout(timer);
        if (mapRef.current) {
          mapRef.current.off("click", handleMapClick);
        }
        if (draggableMarkerRef.current) {
          draggableMarkerRef.current.remove();
          draggableMarkerRef.current = null;
        }
      };
    } else {
      if (draggableMarkerRef.current) {
        draggableMarkerRef.current.remove();
        draggableMarkerRef.current = null;
      }
    }
  }, [showStopDrawer]);

  // Coordinate manual change triggers
  const handleLatitudeChange = (val: number) => {
    setStopForm(prev => {
      const next = { ...prev, latitude: val };
      if (draggableMarkerRef.current && !isNaN(val) && !isNaN(prev.longitude)) {
        draggableMarkerRef.current.setLngLat([prev.longitude, val]);
      }
      return next;
    });
  };

  const handleLongitudeChange = (val: number) => {
    setStopForm(prev => {
      const next = { ...prev, longitude: val };
      if (draggableMarkerRef.current && !isNaN(val) && !isNaN(prev.latitude)) {
        draggableMarkerRef.current.setLngLat([val, prev.latitude]);
      }
      return next;
    });
  };

  // Mapbox Geocoding Autocomplete Search Handlers
  const handleSearchLocationChange = async (val: string) => {
    setSearchLocation(val);

    if (val.trim().length < 3) {
      setStopSuggestions([]);
      setShowSuggestionsList(false);
      return;
    }

    if (!mapboxToken) return;

    setIsSearchingStops(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(val)}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&proximity=36.8219,-1.2921&country=KE`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.features) {
          setStopSuggestions(data.features);
          setShowSuggestionsList(true);
        }
      }
    } catch (err) {
      console.error("Geocoding autocomplete failed:", err);
    } finally {
      setIsSearchingStops(false);
    }
  };

  const handleSelectSuggestion = (feat: any) => {
    const [lng, lat] = feat.center;
    setSearchLocation(feat.place_name);
    setStopForm(prev => ({
      ...prev,
      name: feat.text || feat.place_name,
      longitude: parseFloat(lng.toFixed(6)),
      latitude: parseFloat(lat.toFixed(6))
    }));

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        essential: true
      });
    }

    if (draggableMarkerRef.current) {
      draggableMarkerRef.current.setLngLat([lng, lat]);
    }

    setStopSuggestions([]);
    setShowSuggestionsList(false);
  };

  const handleSchoolNameChange = async (val: string) => {
    setTempSchoolConfig(prev => ({ ...prev, name: val }));

    if (val.trim().length < 3) {
      setSchoolSuggestions([]);
      setShowSchoolSuggestions(false);
      return;
    }

    if (!mapboxToken) return;

    setIsSearchingSchool(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(val)}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&proximity=36.8219,-1.2921&country=KE`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.features) {
          setSchoolSuggestions(data.features);
          setShowSchoolSuggestions(true);
        }
      }
    } catch (err) {
      console.error("School geocoding autocomplete failed:", err);
    } finally {
      setIsSearchingSchool(false);
    }
  };

  const handleSelectSchoolSuggestion = (feat: any) => {
    const [lng, lat] = feat.center;
    setTempSchoolConfig(prev => ({
      ...prev,
      name: feat.place_name,
      longitude: parseFloat(lng.toFixed(6)),
      latitude: parseFloat(lat.toFixed(6))
    }));

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        essential: true
      });
    }

    if (draggableSchoolMarkerRef.current) {
      draggableSchoolMarkerRef.current.setLngLat([lng, lat]);
    }

    setSchoolSuggestions([]);
    setShowSchoolSuggestions(false);
  };

  const initializeDraggableSchoolMarker = async (lng: number, lat: number) => {
    if (!mapRef.current) return;
    const mapboxglModule = (await import("mapbox-gl")).default;

    // Check again after async import to ensure component wasn't unmounted/map removed
    if (!mapRef.current) return;

    if (draggableSchoolMarkerRef.current) {
      draggableSchoolMarkerRef.current.remove();
      draggableSchoolMarkerRef.current = null;
    }

    const el = document.createElement("div");
    el.className = "draggable-school-place-marker";
    el.style.width = "30px";
    el.style.height = "30px";
    el.style.borderRadius = "50% 50% 50% 0";
    el.style.background = "#6366f1"; // indigo-500
    el.style.border = "2px solid #ffffff";
    el.style.transform = "rotate(-45deg)";
    el.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
    el.style.cursor = "move";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";

    const inner = document.createElement("div");
    inner.style.width = "10px";
    inner.style.height = "10px";
    inner.style.background = "#ffffff";
    inner.style.borderRadius = "50%";
    inner.style.transform = "rotate(45deg)";
    el.appendChild(inner);

    const marker = new mapboxglModule.Marker({
      element: el,
      draggable: true,
      anchor: "bottom"
    })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      setTempSchoolConfig(prev => ({
        ...prev,
        longitude: parseFloat(lngLat.lng.toFixed(6)),
        latitude: parseFloat(lngLat.lat.toFixed(6))
      }));
    });

    draggableSchoolMarkerRef.current = marker;

    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      essential: true
    });
  };

  useEffect(() => {
    if (showSchoolModal && mapRef.current) {
      const timer = setTimeout(() => {
        initializeDraggableSchoolMarker(tempSchoolConfig.longitude, tempSchoolConfig.latitude);
      }, 400);

      const handleMapClick = (e: any) => {
        const lngLat = e.lngLat;
        if (!lngLat) return;
        const lng = parseFloat(lngLat.lng.toFixed(6));
        const lat = parseFloat(lngLat.lat.toFixed(6));
        
        setTempSchoolConfig(prev => ({
          ...prev,
          longitude: lng,
          latitude: lat
        }));

        if (draggableSchoolMarkerRef.current) {
          draggableSchoolMarkerRef.current.setLngLat([lng, lat]);
        }
      };

      mapRef.current.on("click", handleMapClick);

      return () => {
        clearTimeout(timer);
        if (mapRef.current) {
          mapRef.current.off("click", handleMapClick);
        }
        if (draggableSchoolMarkerRef.current) {
          draggableSchoolMarkerRef.current.remove();
          draggableSchoolMarkerRef.current = null;
        }
      };
    } else {
      if (draggableSchoolMarkerRef.current) {
        draggableSchoolMarkerRef.current.remove();
        draggableSchoolMarkerRef.current = null;
      }
    }
  }, [showSchoolModal]);

  const handleSchoolLatitudeChange = (val: number) => {
    setTempSchoolConfig(prev => {
      const next = { ...prev, latitude: val };
      if (draggableSchoolMarkerRef.current && !isNaN(val) && !isNaN(prev.longitude)) {
        draggableSchoolMarkerRef.current.setLngLat([prev.longitude, val]);
      }
      return next;
    });
  };

  const handleSchoolLongitudeChange = (val: number) => {
    setTempSchoolConfig(prev => {
      const next = { ...prev, longitude: val };
      if (draggableSchoolMarkerRef.current && !isNaN(val) && !isNaN(prev.latitude)) {
        draggableSchoolMarkerRef.current.setLngLat([val, prev.latitude]);
      }
      return next;
    });
  };

  // Load school locations on mount
  useEffect(() => {
    const saved = localStorage.getItem("safaricom_school_locations");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSchoolLocations(parsed);
        }
      } catch (e) {
        console.error("Failed to parse school locations:", e);
      }
    }
  }, []);

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
          setStops(stopsJson.data);
        }

        // Fetch schedules
        const schedulesRes = await fetch("/api/schedules");
        const schedulesJson = await schedulesRes.json();
        if (schedulesJson.success) {
          setSchedules(schedulesJson.data);
        }

        // Fetch fleet vehicles
        const fleetRes = await fetch("/api/fleet");
        const fleetJson = await fleetRes.json();
        if (fleetJson.success) {
          setVehicles(fleetJson.data);
        }
      } catch (err) {
        console.error("Error loading route management data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRouteData();
  }, []);

  // Save actions
  const saveStopsState = (updatedStops: DBStop[]) => {
    setStops(updatedStops);
  };

  const saveSchedulesState = (updatedSchedules: DBSchedule[]) => {
    setSchedules(updatedSchedules);
  };

  // Save stop legs details (distance and duration) to state, localStorage, and DB
  const saveRouteLegsToDB = async (currentRouteStops: DBStop[], legs: any[]) => {
    const updatesNeeded: { stopId: string; payload: { distance_from_prev_meters: number; duration_from_prev_seconds: number } }[] = [];
    const updatedStopsMap = new Map<string, DBStop>();

    currentRouteStops.forEach((stop, index) => {
      let expectedDist = 0;
      let expectedDur = 0;

      if (index > 0 && legs[index - 1]) {
        expectedDist = Math.round(legs[index - 1].distance);
        expectedDur = Math.round(legs[index - 1].duration);
      }

      if (
        stop.distance_from_prev_meters !== expectedDist ||
        stop.duration_from_prev_seconds !== expectedDur
      ) {
        updatesNeeded.push({
          stopId: stop.id,
          payload: {
            distance_from_prev_meters: expectedDist,
            duration_from_prev_seconds: expectedDur,
          },
        });
        
        updatedStopsMap.set(stop.id, {
          ...stop,
          distance_from_prev_meters: expectedDist,
          duration_from_prev_seconds: expectedDur,
        });
      }
    });

    if (updatesNeeded.length === 0) return;

    // 1. Instantly update React state for responsive UI
    setStops(prevStops => {
      const nextStops = prevStops.map(s => {
        if (updatedStopsMap.has(s.id)) {
          return updatedStopsMap.get(s.id)!;
        }
        return s;
      });
      return nextStops;
    });

    // 2. Persist to DB asynchronously in the background
    for (const update of updatesNeeded) {
      try {
        await fetch(`/api/stops/${update.stopId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update.payload),
        });
      } catch (err) {
        console.error(`Failed to update leg details for stop ${update.stopId}:`, err);
      }
    }
  };

  // Dynamic route line from stops sequence
  const updateRouteLine = async (map: mapboxgl.Map, currentRouteStops: DBStop[]) => {
    if (!map.getSource("active-route-src")) return;

    if (activeTab === "schools" || currentRouteStops.length < 2) {
      lastCoordsQueryRef.current = "";
      const source = map.getSource("active-route-src") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] }
        });
      }
      return;
    }

    const coords = currentRouteStops.map(s => s.location.coordinates);
    const query = coords.map(c => `${c[0]},${c[1]}`).join(";");
    
    if (coords.length < 2) {
      lastCoordsQueryRef.current = "";
      const source = map.getSource("active-route-src") as any;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] }
        });
      }
      return;
    }

    if (query === lastCoordsQueryRef.current) {
      return;
    }
    
    lastCoordsQueryRef.current = query;
    let routeGeometry: any = null;
    let legs: any[] = [];

    if (mapboxToken) {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${query}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            routeGeometry = data.routes[0].geometry;
            legs = data.routes[0].legs || [];
          }
        }
      } catch (err) {
        console.warn("Mapbox Directions API failed, using straight-line fallback:", err);
      }
    }

    if (!routeGeometry) {
      routeGeometry = {
        type: "LineString",
        coordinates: coords
      };
    }

    const source = map.getSource("active-route-src") as any;
    if (source && routeGeometry) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: routeGeometry
      });
    }

    if (legs.length === currentRouteStops.length - 1) {
      saveRouteLegsToDB(currentRouteStops, legs);
    }
  };

  // Mapbox rendering
  useEffect(() => {
    if (!hasMapboxToken || !mapContainerRef.current || !currentRoute) return;

    let isMounted = true;
    let mapInstance: mapboxgl.Map | null = null;

    const initMap = async () => {
      const mapboxglModule = (await import("mapbox-gl")).default;
      
      if (!isMounted || !mapContainerRef.current) return;

      mapboxglModule.accessToken = mapboxToken;

      const centerCoord = currentRoute.path?.coordinates[0] || [36.8045, -1.2721];

      mapInstance = new mapboxglModule.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/traffic-night-v2",
        center: centerCoord as [number, number],
        zoom: 13,
        pitch: 35,
      });

      mapRef.current = mapInstance;
      mapInstance.addControl(new mapboxglModule.NavigationControl(), "top-right");

      mapInstance.on("load", () => {
        if (!isMounted || !mapInstance) return;

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
      isMounted = false;
      if (mapInstance) {
        mapInstance.remove();
      }
      mapRef.current = null;
    };
  }, [selectedRouteId, routes, hasMapboxToken]);

  // Update map markers when stops list updates
  const updateMapMarkers = async (map: mapboxgl.Map, mapboxglModule: any) => {
    // Clear old markers
    stopMarkersRef.current.forEach(marker => marker.remove());
    stopMarkersRef.current = [];

    if (activeTab === "schools") {
      schoolLocations.forEach((loc) => {
        const el = document.createElement("div");
        el.className = "map-school-marker-container";
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";
        el.style.cursor = "pointer";
        
        el.innerHTML = `
          <div class="school-icon-wrapper" style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: #4f46e5;
            border: 2px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(79, 70, 229, 0.6);
          ">
            <img src="/assets/school-location-icon.png" alt="School" style="width: 20px; height: 20px; object-fit: contain;" />
          </div>
          <div class="school-label" style="
            margin-top: 4px;
            background-color: rgba(15, 23, 42, 0.85);
            color: #ffffff;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">
            ${loc.name}
          </div>
        `;

        const popup = new mapboxglModule.Popup({ offset: 15 }).setHTML(
          `<div style="color:#0f172a; font-family:var(--font-sans); padding:4px;">
            <h4 style="font-weight:600; margin:0 0 2px 0;">School: ${loc.name}</h4>
            <span style="font-size:0.75rem; color:#64748b;">Coordinates: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</span>
           </div>`
        );

        const marker = new mapboxglModule.Marker(el)
          .setLngLat([loc.longitude, loc.latitude])
          .setPopup(popup)
          .addTo(map);

        stopMarkersRef.current.push(marker);
      });

      if (schoolLocations.length > 0) {
        const bounds = new mapboxglModule.LngLatBounds();
        schoolLocations.forEach(loc => bounds.extend([loc.longitude, loc.latitude]));
        map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 1000 });
      }
      return;
    }

    const routeStops = stops
      .filter(s => s.route_id === selectedRouteId)
      .sort((a, b) => a.sequence_no - b.sequence_no);
    
    // Group stops that share the same (or very close) coordinates to prevent overlap hiding
    const groupedStops: { coordinates: [number, number]; stops: DBStop[] }[] = [];
    routeStops.forEach((stop) => {
      if (!stop.location || !stop.location.coordinates) return;
      const coord = stop.location.coordinates;
      const existingGroup = groupedStops.find(g => 
        Math.abs(g.coordinates[0] - coord[0]) < 1e-6 &&
        Math.abs(g.coordinates[1] - coord[1]) < 1e-6
      );
      if (existingGroup) {
        existingGroup.stops.push(stop);
      } else {
        groupedStops.push({
          coordinates: coord as [number, number],
          stops: [stop]
        });
      }
    });

    groupedStops.forEach((group) => {
      const el = document.createElement("div");
      
      // Check if coordinates match any school location
      const matchingSchool = schoolLocations.find(school => 
        Math.abs(school.longitude - group.coordinates[0]) < 1e-4 &&
        Math.abs(school.latitude - group.coordinates[1]) < 1e-4
      );
      const isSchool = !!matchingSchool;

      if (isSchool) {
        el.className = "map-school-marker-container";
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";
        el.style.cursor = "pointer";

        el.innerHTML = `
          <div class="school-icon-wrapper" style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: #4f46e5;
            border: 2px solid #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(79, 70, 229, 0.6);
          ">
            <img src="/assets/school-location-icon.png" alt="School" style="width: 20px; height: 20px; object-fit: contain;" />
          </div>
          <div class="school-label" style="
            margin-top: 4px;
            background-color: rgba(15, 23, 42, 0.85);
            color: #ffffff;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">
            ${matchingSchool ? matchingSchool.name : 'School'}
          </div>
        `;
      } else {
        el.className = "map-stop-marker";
        el.style.height = "22px";
        el.style.backgroundColor = "rgba(99, 102, 241, 0.25)";
        el.style.border = "2px solid #6366f1";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "#ffffff";
        el.style.fontWeight = "bold";
        el.style.fontSize = "10px";
        el.style.boxShadow = "0 0 8px #6366f1";

        const labelParts = group.stops.map(s => {
          if (s.sequence_no === 1) return "Start";
          if (s.sequence_no === routeStops.length && routeStops.length > 1) return "End";
          return s.sequence_no.toString();
        });
        const label = labelParts.join(", ");
        el.textContent = label;

        // Adjust shape/width if it is a pill (has text like "Start", "End" or multiple values)
        const hasWordLabel = labelParts.some(l => l.length > 1);
        if (group.stops.length > 1 || hasWordLabel) {
          el.style.padding = "0 8px";
          el.style.width = "auto";
          el.style.minWidth = "22px";
          el.style.borderRadius = "11px";
        } else {
          el.style.width = "22px";
          el.style.borderRadius = "50%";
        }
      }

      let popupHTML = `<div style="color:#0f172a; font-family:var(--font-sans); padding:4px; max-width:260px;">`;
      if (group.stops.length > 1) {
        popupHTML += `<h4 style="font-weight:700; margin:0 0 6px 0; font-size:0.875rem; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">Stops at this Location</h4>`;
        group.stops.forEach((stop, index) => {
          let legLabel = `Stop #${stop.sequence_no}`;
          if (stop.sequence_no === 1) legLabel = "Start (Stop #1)";
          else if (stop.sequence_no === routeStops.length) legLabel = `End (Stop #${stop.sequence_no})`;

          const legText = stop.sequence_no > 1 
            ? `<div style="font-size:0.75rem; color:#6366f1; font-weight:600; margin-top:2px;">
                Leg: ${(stop.distance_from_prev_meters ? stop.distance_from_prev_meters / 1000 : 0).toFixed(2)} km (${Math.round((stop.duration_from_prev_seconds ? stop.duration_from_prev_seconds : 0) / 60)} mins)
               </div>`
            : `<div style="font-size:0.75rem; color:#64748b; font-style:italic; margin-top:2px;">Route Start</div>`;

          popupHTML += `
            <div style="margin-bottom:${index === group.stops.length - 1 ? "0" : "8px"};">
              <h5 style="font-weight:600; margin:0 0 2px 0; font-size:0.8rem;">${legLabel}: ${stop.name}</h5>
              <div style="font-size:0.75rem; color:#64748b; line-height: 1.3;">
                Radius: ${stop.geofence_radius_meters}m • Type: ${stop.stop_type}
              </div>
              ${legText}
            </div>
          `;
        });
      } else {
        const stop = group.stops[0];
        let legLabel = `Stop #${stop.sequence_no}`;
        if (stop.sequence_no === 1) legLabel = "Start (Stop #1)";
        else if (stop.sequence_no === routeStops.length && routeStops.length > 1) legLabel = `End (Stop #${stop.sequence_no})`;

        const legText = stop.sequence_no > 1 
          ? `<div style="font-size:0.75rem; color:#6366f1; font-weight:600; margin-top:2px;">
              Leg: ${(stop.distance_from_prev_meters ? stop.distance_from_prev_meters / 1000 : 0).toFixed(2)} km (${Math.round((stop.duration_from_prev_seconds ? stop.duration_from_prev_seconds : 0) / 60)} mins)
             </div>`
          : `<div style="font-size:0.75rem; color:#64748b; font-style:italic; margin-top:2px;">Route Start</div>`;

        popupHTML += `
          <h4 style="font-weight:600; margin:0 0 2px 0; font-size:0.875rem;">${legLabel}: ${stop.name}</h4>
          <span style="font-size:0.75rem; color:#64748b;">Radius: ${stop.geofence_radius_meters}m • Type: ${stop.stop_type}</span>
          ${legText}
        `;
      }
      popupHTML += `</div>`;

      const popup = new mapboxglModule.Popup({ offset: 15 }).setHTML(popupHTML);

      const marker = new mapboxglModule.Marker(el)
        .setLngLat(group.coordinates)
        .setPopup(popup)
        .addTo(map);

      stopMarkersRef.current.push(marker);
    });

    // Auto-fit the map bounds to contain all stops on the route, or the route line coordinates if no stops yet
    if (routeStops.length > 0) {
      const bounds = new mapboxglModule.LngLatBounds();
      routeStops.forEach(stop => {
        if (stop.location && stop.location.coordinates) {
          bounds.extend(stop.location.coordinates as [number, number]);
        }
      });
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });
    } else if (currentRoute && currentRoute.path && currentRoute.path.coordinates && currentRoute.path.coordinates.length > 0) {
      const bounds = new mapboxglModule.LngLatBounds();
      currentRoute.path.coordinates.forEach(coord => bounds.extend(coord));
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });
    }
  };

  // Automatically update map markers and route lines if Mapbox is running and stops/route change
  useEffect(() => {
    if (mapRef.current) {
      import("mapbox-gl").then(module => {
        if (!mapRef.current) return;
        updateMapMarkers(mapRef.current, module.default);
        updateRouteLine(mapRef.current, routeStops);
      });
    }
  }, [stops, selectedRouteId, activeTab, schoolLocations]);

  const resequenceRouteStops = async (routeId: string, currentRouteStops: DBStop[]) => {
    const reindexed = currentRouteStops.map((stop, idx) => ({
      ...stop,
      sequence_no: idx + 1
    }));

    setStops(prev => {
      const otherStops = prev.filter(s => s.route_id !== routeId);
      return [...otherStops, ...reindexed];
    });

    try {
      const stopIds = reindexed.map(s => s.id);
      const res = await fetch("/api/stops/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_ids: stopIds, route_id: routeId })
      });
      const json = await res.json();
      if (!json.success) {
        console.error("Failed to persist stop order:", json.error);
      }
    } catch (err) {
      console.error("Error saving stop order:", err);
    }
  };

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
        
        let newRouteStops = [...routeStops];
        if (stopDrawerMode === "edit") {
          newRouteStops = newRouteStops.filter(s => s.id !== savedStop.id);
        }
        const insertIndex = Math.max(0, Math.min(newRouteStops.length, savedStop.sequence_no - 1));
        newRouteStops.splice(insertIndex, 0, savedStop);

        await resequenceRouteStops(selectedRouteId, newRouteStops);
        
        setShowStopDrawer(false);
        setSearchLocation("");
        setStopForm({
          name: "",
          longitude: 36.8045,
          latitude: -1.2721,
          sequence_no: newRouteStops.length + 1,
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
        const remainingRouteStops = routeStops.filter(s => s.id !== id);
        await resequenceRouteStops(selectedRouteId, remainingRouteStops);
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
      days_of_week: scheduleForm.days_of_week,
      vehicle_id: scheduleForm.vehicle_id || null
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
          days_of_week: payload.days_of_week,
          vehicle_id: payload.vehicle_id
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
          days_of_week: [1, 2, 3, 4, 5],
          vehicle_id: ""
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

  const handleOpenEditRoute = (route: DBRoute) => {
    setEditRouteId(route.id);
    setEditRouteName(route.name);
    setShowEditRouteDrawer(true);
  };

  const handleEditRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRouteName.trim()) return;
    setIsSubmitLoading(true);

    try {
      const res = await fetch(`/api/routes/${editRouteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editRouteName
        })
      });
      const json = await res.json();
      if (json.success) {
        setRoutes(prev => prev.map(r => r.id === editRouteId ? { ...r, name: editRouteName } : r));
        setShowEditRouteDrawer(false);
      } else {
        alert(json.error || "Failed to update route");
      }
    } catch (err) {
      console.error("Error editing route:", err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!confirm("Are you sure you want to delete this entire transit route? All associated stops and schedules will also be removed.")) return;
    
    try {
      const res = await fetch(`/api/routes/${routeId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setRoutes(prev => prev.filter(r => r.id !== routeId));
        if (selectedRouteId === routeId) {
          const remaining = routes.filter(r => r.id !== routeId);
          if (remaining.length > 0) {
            setSelectedRouteId(remaining[0].id);
          } else {
            setSelectedRouteId("");
          }
        }
      } else {
        alert(json.error || "Failed to delete route");
      }
    } catch (err) {
      console.error("Error deleting route:", err);
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeName.trim()) return;

    const startLoc = schoolLocations.find(l => l.id === startSchoolId) || schoolLocations[0];
    const endLoc = schoolLocations.find(l => l.id === endSchoolId) || schoolLocations[0];

    if (!startLoc || !endLoc) {
      alert("Please configure a school location first.");
      return;
    }

    setIsSubmitLoading(true);

    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          schoolStart: { name: startLoc.name, latitude: startLoc.latitude, longitude: startLoc.longitude },
          schoolEnd: { name: endLoc.name, latitude: endLoc.latitude, longitude: endLoc.longitude }
        })
      });
      const json = await res.json();
      if (json.success) {
        const { route, schoolStops } = json.data;
        setRoutes(prev => [...prev, route]);
        setSelectedRouteId(route.id);
        if (schoolStops && schoolStops.length > 0) {
          saveStopsState([...stops, ...schoolStops]);
        }
        setShowRouteDrawer(false);
        setRouteName("");
        router.push("/routes");
      } else {
        alert(json.error || "Failed to create route");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newRouteStops = [...routeStops];
    const [draggedItem] = newRouteStops.splice(draggedIndex, 1);
    newRouteStops.splice(targetIndex, 0, draggedItem);

    await resequenceRouteStops(selectedRouteId, newRouteStops);
    setDraggedIndex(null);
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

        /* Drawer Overlay */
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(4, 6, 12, 0.35);
          z-index: 100;
          display: flex;
          justify-content: flex-end;
          pointer-events: none;
          animation: drawer-fade-in 0.2s ease-out;
        }
        /* Drawer Content */
        .drawer-content {
          width: 450px;
          height: 100%;
          background: var(--bg-surface);
          border-left: 1px solid var(--border-default);
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          box-shadow: -10px 0 25px rgba(0, 0, 0, 0.5);
          pointer-events: auto;
          animation: drawer-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes drawer-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes drawer-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        /* Premium Form Fields */
        .form-group {
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
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
          width: 100%;
        }
        .form-input:focus {
          border-color: var(--accent-secondary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
          background: rgba(6, 9, 19, 0.8);
        }
        select.form-input {
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 16px;
          padding-right: 40px;
        }
        select.form-input option {
          background: #0c1122;
          color: var(--text-primary);
        }

        /* Autocomplete Suggestions styling */
        .autocomplete-suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: rgba(12, 17, 34, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          margin-top: 4px;
          max-height: 220px;
          overflow-y: auto;
          z-index: 60;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
        }
        .suggestion-item {
          padding: 10px 14px;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          transition: background 0.2s ease;
          text-align: left;
        }
        .suggestion-item:last-child {
          border-bottom: none;
        }
        .suggestion-item:hover {
          background: rgba(255, 255, 255, 0.05);
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

        <section 
          className="dashboard-content-layout" 
          style={{ 
            gridTemplateColumns: activeTab === "schools" ? "1fr" : "300px 1fr", 
            gap: "24px" 
          }}
        >
          {/* Left panel: Routes list */}
          {activeTab !== "schools" && (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Compass size={18} style={{ color: "var(--accent-primary)" }} />
                  Active Routes
                </span>
                <button
                  onClick={() => setShowRouteDrawer(true)}
                  style={{
                    background: "rgba(99, 102, 241, 0.1)",
                    color: "var(--accent-secondary)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Plus size={12} />
                  Add Route
                </button>
              </div>

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
                        const rStops = stops.filter(s => s.route_id === route.id);
                        setStopForm(prev => ({ ...prev, sequence_no: rStops.length + 1 }));
                      }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, display: "block", color: "var(--text-primary)" }}>{route.name}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {stops.filter(s => s.route_id === route.id).length} stops • {schedules.filter(s => s.route_id === route.id).length} trips
                        </span>
                      </div>
                      <div 
                        style={{ display: "flex", gap: "6px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleOpenEditRoute(route)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "4px",
                            cursor: "pointer",
                            color: "var(--accent-secondary)"
                          }}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(route.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "4px",
                            cursor: "pointer",
                            color: "var(--state-error)"
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

                  {/* Draw mock stops/schools as markers */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                    {activeTab === "schools" ? (
                      schoolLocations.map((loc, idx) => {
                        const xPercent = 40 + (idx * 20) % 30;
                        const yPercent = 40 + (idx * 15) % 30;
                        return (
                          <div 
                            key={loc.id} 
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
                              H
                            </div>
                            <div className="bus-label">{loc.name}</div>
                          </div>
                        );
                      })
                    ) : (
                      routeStops.map((stop, idx) => {
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
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Stops / Schedules tabs list */}
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", borderBottom: "1px solid var(--border-default)", justifyContent: "space-between", alignItems: "center" }}>
                {activeTab === "schools" ? (
                  <div style={{ padding: "10px 16px", fontSize: "0.90rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <MapPin size={16} style={{ color: "var(--accent-primary)" }} />
                    Configured Campus Locations ({schoolLocations.length})
                  </div>
                ) : (
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
                      Trips ({routeSchedules.length})
                    </button>
                  </div>
                )}

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
                      setSearchLocation("");
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
                ) : activeTab === "schedules" ? (
                  <button 
                    onClick={() => {
                      setScheduleForm({
                        name: "",
                        departure_time: "07:00",
                        direction: "HOME_TO_SCHOOL",
                        target_grades: [],
                        days_of_week: [1, 2, 3, 4, 5],
                        vehicle_id: ""
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
                    Add Trip
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setTempSchoolConfig({
                        name: "",
                        latitude: -1.2921,
                        longitude: 36.8219
                      });
                      setSchoolDrawerMode("add");
                      setCurrentEditSchoolId(null);
                      setShowSchoolModal(true);
                    }}
                    disabled={schoolLocations.length >= 2}
                    style={{
                      background: schoolLocations.length >= 2 ? "rgba(255, 255, 255, 0.02)" : "rgba(99, 102, 241, 0.1)",
                      color: schoolLocations.length >= 2 ? "var(--text-muted)" : "var(--accent-secondary)",
                      border: schoolLocations.length >= 2 ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid rgba(99, 102, 241, 0.2)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: schoolLocations.length >= 2 ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <Plus size={14} />
                    Add School Location
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
                          <th style={{ width: "40px", padding: "10px" }}></th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Seq</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Stop Name</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Coordinates</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Geofence</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Leg Dist / Time</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Type</th>
                          <th style={{ padding: "10px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeStops.map((stop, idx) => (
                          <tr 
                            key={stop.id} 
                            draggable
                            onDragStart={(e) => handleDragStart(e, idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => handleDrop(e, idx)}
                            style={{ 
                              borderBottom: "1px solid rgba(255,255,255,0.02)",
                              opacity: draggedIndex === idx ? 0.4 : 1,
                              background: draggedIndex === idx ? "rgba(99, 102, 241, 0.08)" : undefined,
                              transition: "all 0.15s ease",
                              cursor: "move"
                            }}
                          >
                            <td style={{ padding: "12px 10px", width: "40px", cursor: "grab", color: "var(--text-muted)", verticalAlign: "middle" }}>
                              <GripVertical size={16} />
                            </td>
                            <td style={{ padding: "12px 10px", fontWeight: "bold", color: "var(--accent-primary)" }}>#{stop.sequence_no}</td>
                            <td style={{ padding: "12px 10px", fontWeight: 600, color: "var(--text-primary)" }}>{stop.name}</td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              {stop.location?.coordinates?.[1]?.toFixed(5) ?? "0.00000"}, {stop.location?.coordinates?.[0]?.toFixed(5) ?? "0.00000"}
                            </td>
                            <td style={{ padding: "12px 10px", color: "var(--text-primary)" }}>{stop.geofence_radius_meters} meters</td>
                            <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-primary)" }}>
                              {stop.sequence_no === 1 ? (
                                <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Route Start</span>
                              ) : (
                                (() => {
                                  const isLastStop = routeStops.length > 1 && stop.sequence_no === routeStops.length;
                                  const isLastStopAndSchool = isLastStop && 
                                    routeStops[0]?.location?.coordinates && 
                                    stop.location?.coordinates && 
                                    Math.abs(routeStops[0].location.coordinates[0] - stop.location.coordinates[0]) < 1e-6 && 
                                    Math.abs(routeStops[0].location.coordinates[1] - stop.location.coordinates[1]) < 1e-6;

                                  if (isLastStopAndSchool) {
                                    return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Route End</span>;
                                  }

                                  return (
                                    <span>
                                      {stop.distance_from_prev_meters ? (stop.distance_from_prev_meters / 1000).toFixed(2) : "0.00"} km
                                      <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>•</span>
                                      {stop.duration_from_prev_seconds ? Math.round(stop.duration_from_prev_seconds / 60) : "0"} mins
                                    </span>
                                  );
                                })()
                              )}
                            </td>
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
              ) : activeTab === "schedules" ? (
                routeSchedules.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No trips configured. Click "Add Trip" to start session planner.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="student-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Trip Name</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Dep. Time</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Direction</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Assigned Bus</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Target Grades</th>
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Operating Days</th>
                          <th style={{ padding: "10px", textAlign: "right", fontSize: "0.75rem", color: "var(--text-muted)" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routeSchedules.map(sched => {
                          const assignedVehicle = vehicles.find(v => v.id === sched.vehicle_id);
                          return (
                            <tr key={sched.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                              <td style={{ padding: "12px 10px", fontWeight: 600, color: "var(--text-primary)" }}>{sched.name}</td>
                              <td style={{ padding: "12px 10px", fontWeight: "bold", color: "var(--accent-secondary)" }}>
                                <Clock size={12} style={{ display: "inline", marginRight: "4px" }} />
                                {sched.departure_time.slice(0, 5)}
                              </td>
                              <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-primary)" }}>{getDirectionText(sched.direction)}</td>
                              <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-primary)" }}>
                                {assignedVehicle ? (
                                  <span style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>
                                    {assignedVehicle.model} ({assignedVehicle.license_plate})
                                  </span>
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                                )}
                              </td>
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
                        );
                      })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                schoolLocations.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No school locations configured.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    {schoolLocations.map((loc) => (
                      <div 
                        key={loc.id} 
                        style={{ 
                          background: "rgba(255, 255, 255, 0.02)", 
                          border: "1px solid var(--border-default)", 
                          borderRadius: "8px", 
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: "12px",
                          position: "relative"
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <MapPin size={18} style={{ color: "var(--accent-primary)", marginTop: "2px", flexShrink: 0 }} />
                            <div>
                              <h4 style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem", margin: 0 }}>{loc.name}</h4>
                              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                                Lat: {loc.latitude.toFixed(6)} • Lng: {loc.longitude.toFixed(6)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px", justifyContent: "flex-end" }}>
                          <button 
                            onClick={() => handleStartEditSchool(loc)}
                            style={{ 
                              background: "rgba(99,102,241,0.05)", 
                              border: "none", 
                              borderRadius: "6px", 
                              padding: "6px 12px", 
                              cursor: "pointer", 
                              color: "var(--accent-secondary)",
                              fontSize: "0.75rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                          >
                            <Edit size={12} />
                            Edit
                          </button>
                          {schoolLocations.length > 1 && (
                            <button 
                              onClick={() => handleDeleteSchool(loc.id)}
                              style={{ 
                                background: "rgba(244,63,94,0.05)", 
                                border: "none", 
                                borderRadius: "6px", 
                                padding: "6px 12px", 
                                cursor: "pointer", 
                                color: "var(--state-error)",
                                fontSize: "0.75rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
              {stopDrawerMode === "add" && (
                <div className="form-group">
                  <label className="form-label">Or Select Existing Stop</label>
                  <select
                    className="form-input"
                    value=""
                    onChange={(e) => {
                      const selectedStopId = e.target.value;
                      if (!selectedStopId) return;
                      const existingStop = stops.find(s => s.id === selectedStopId);
                      if (existingStop && existingStop.location && existingStop.location.coordinates) {
                        setStopForm(prev => ({
                          ...prev,
                          name: existingStop.name,
                          latitude: existingStop.location.coordinates[1],
                          longitude: existingStop.location.coordinates[0],
                          geofence_radius_meters: existingStop.geofence_radius_meters,
                          stop_type: existingStop.stop_type
                        }));
                        setSearchLocation(existingStop.name);
                        if (mapRef.current) {
                          mapRef.current.flyTo({
                            center: existingStop.location.coordinates,
                            zoom: 15,
                            essential: true
                          });
                        }
                        if (draggableMarkerRef.current) {
                          draggableMarkerRef.current.setLngLat(existingStop.location.coordinates);
                        }
                      }
                    }}
                  >
                    <option value="">-- Choose an existing stop --</option>
                    {Array.from(new Map(stops.map(s => [s.name, s])).values()).map(stop => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name} ({stop.location.coordinates[1].toFixed(4)}, {stop.location.coordinates[0].toFixed(4)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Search Location</label>
                <input 
                  type="text" 
                  placeholder="Search for a location on the map..."
                  className="form-input"
                  value={searchLocation}
                  onChange={(e) => handleSearchLocationChange(e.target.value)}
                  onFocus={() => {
                    if (stopSuggestions.length > 0) setShowSuggestionsList(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestionsList(false), 200);
                  }}
                />
                
                {showSuggestionsList && stopSuggestions.length > 0 && (
                  <div className="autocomplete-suggestions">
                    {stopSuggestions.map(feat => (
                      <div 
                        key={feat.id} 
                        className="suggestion-item"
                        onMouseDown={() => handleSelectSuggestion(feat)}
                      >
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{feat.text}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{feat.place_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Stop Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Ruaka Joyland"
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
                    value={isNaN(stopForm.latitude) ? "" : stopForm.latitude}
                    onChange={(e) => handleLatitudeChange(parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude *</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    required
                    className="form-input"
                    value={isNaN(stopForm.longitude) ? "" : stopForm.longitude}
                    onChange={(e) => handleLongitudeChange(parseFloat(e.target.value))}
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
                {scheduleDrawerMode === "edit" ? "Edit Trip" : "Add Trip"}
              </h2>
              <button onClick={() => setShowScheduleDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSchedule} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Trip Name *</label>
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
                    { num: 5, label: "Fri" },
                    { num: 6, label: "Sat" },
                    { num: 7, label: "Sun" }
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

              {/* Assigned Bus */}
              <div className="form-group">
                <label className="form-label">Assigned Fleet Bus (Vehicle)</label>
                <select
                  className="form-input"
                  value={scheduleForm.vehicle_id}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, vehicle_id: e.target.value }))}
                >
                  <option value="">-- No Bus Assigned --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.model} ({v.license_plate}) - Capacity: {v.capacity}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Links this trip to a specific bus. The driver of this bus will automatically run this trip upon login.
                </span>
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
                  {isSubmitLoading ? "Saving Trip..." : (scheduleDrawerMode === "edit" ? "Update Trip" : "Save Trip")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Route onboard drawer */}
      {showRouteDrawer && (
        <div className="drawer-overlay" onClick={() => setShowRouteDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Compass size={18} style={{ color: "var(--accent-primary)" }} />
                Add New Route
              </h2>
              <button onClick={() => setShowRouteDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddRoute} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Route Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Route 5 (Kasarani)"
                  className="form-input"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Start School Location *</label>
                <select
                  className="form-input"
                  value={startSchoolId}
                  onChange={(e) => setStartSchoolId(e.target.value)}
                  required
                >
                  {schoolLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">End School Location *</label>
                <select
                  className="form-input"
                  value={endSchoolId}
                  onChange={(e) => setEndSchoolId(e.target.value)}
                  required
                >
                  {schoolLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowRouteDrawer(false)}
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
                  {isSubmitLoading ? "Creating Route..." : "Create Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Route Modal Drawer */}
      {showEditRouteDrawer && (
        <div className="drawer-overlay" onClick={() => setShowEditRouteDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid var(--border-default)", paddingBottom: "16px" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <Compass size={20} style={{ color: "var(--accent-primary)" }} />
                Edit Route Configuration
              </h2>
              <button 
                onClick={() => setShowEditRouteDrawer(false)} 
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditRouteSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Route Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Morning Route 1 (Kileleshwa)"
                  className="form-input"
                  value={editRouteName}
                  onChange={(e) => setEditRouteName(e.target.value)}
                />
              </div>



              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowEditRouteDrawer(false)}
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
                  {isSubmitLoading ? "Saving Changes..." : "Save Route"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit School Location Modal */}
      {showSchoolModal && (
        <div className="drawer-overlay" onClick={() => setShowSchoolModal(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()} style={{ width: "380px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--border-default)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                <MapPin size={18} style={{ color: "var(--accent-primary)" }} />
                {schoolDrawerMode === "edit" ? "Edit School Location" : "Add School Location"}
              </h2>
              <button onClick={() => setShowSchoolModal(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">School Name *</label>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Search school location..."
                  value={tempSchoolConfig.name}
                  onChange={(e) => handleSchoolNameChange(e.target.value)}
                  onFocus={() => {
                    if (schoolSuggestions.length > 0) setShowSchoolSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSchoolSuggestions(false), 200);
                  }}
                />

                {showSchoolSuggestions && schoolSuggestions.length > 0 && (
                  <div className="autocomplete-suggestions">
                    {schoolSuggestions.map(feat => (
                      <div 
                        key={feat.id} 
                        className="suggestion-item"
                        onMouseDown={() => handleSelectSchoolSuggestion(feat)}
                      >
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{feat.text}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{feat.place_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Latitude *</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    className="form-input"
                    value={isNaN(tempSchoolConfig.latitude) ? "" : tempSchoolConfig.latitude}
                    onChange={(e) => handleSchoolLatitudeChange(parseFloat(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitude *</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    className="form-input"
                    value={isNaN(tempSchoolConfig.longitude) ? "" : tempSchoolConfig.longitude}
                    onChange={(e) => handleSchoolLongitudeChange(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setShowSchoolModal(false)}
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
                  type="button"
                  onClick={handleSaveSchool}
                  style={{
                    flex: 2,
                    background: "var(--accent-primary)",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 16px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  {schoolDrawerMode === "edit" ? "Save Changes" : "Add Location"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function RoutesManagementPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0c1122", color: "#64748b", fontFamily: "var(--font-sans)" }}>
        Loading Route Planning...
      </div>
    }>
      <RoutesManagement />
    </Suspense>
  );
}

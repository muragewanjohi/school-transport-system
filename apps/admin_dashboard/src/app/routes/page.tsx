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
  GripVertical,
  ListPlus
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useSearchParams, useRouter } from "next/navigation";
import {
  groupStopsByRoute,
  stopsAvailableToAttach,
} from "@/lib/attachStopsToRoute";
import {
  formatScheduleApiErrors,
  summarizeMissingScheduleFields,
  tripTypeLabel,
  validateScheduleForm,
} from "@/lib/scheduleFormValidation";

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

declare global {
  interface Window {
    google: any;
    initGoogleMapsRoutes?: () => void;
  }
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
  const [showAttachStopsModal, setShowAttachStopsModal] = useState(false);
  const [selectedAttachIds, setSelectedAttachIds] = useState<string[]>([]);
  const [attachSearch, setAttachSearch] = useState("");
  const [isAttachLoading, setIsAttachLoading] = useState(false);
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
  const draggableMarkerRef = useRef<any>(null);
  const draggableSchoolMarkerRef = useRef<any>(null);

  const [stopDrawerMode, setStopDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditStopId, setCurrentEditStopId] = useState<string | null>(null);
  const [scheduleDrawerMode, setScheduleDrawerMode] = useState<"add" | "edit">("add");
  const [currentEditScheduleId, setCurrentEditScheduleId] = useState<string | null>(null);

  const handleStartEditStop = (stop: DBStop) => {
    router.push(`/routes/stops/${stop.id}/edit?return=/routes`);
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
    setScheduleFormErrors({});
    setScheduleFormSummary(null);
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
    direction: "" as "" | "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME",
    target_grades: [] as string[],
    days_of_week: [1, 2, 3, 4, 5],
    vehicle_id: ""
  });
  const [scheduleFormErrors, setScheduleFormErrors] = useState<Record<string, string>>({});
  const [scheduleFormSummary, setScheduleFormSummary] = useState<string | null>(null);

  // Google Maps references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const stopMarkersRef = useRef<any[]>([]);
  const activePolylineRef = useRef<any>(null);
  const lastCoordsQueryRef = useRef<string>("");

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // DRAGGABLE MARKER INITIALIZER
  const initializeDraggableMarker = (lng: number, lat: number) => {
    if (!mapRef.current || !window.google || !window.google.maps) return;

    if (draggableMarkerRef.current) {
      draggableMarkerRef.current.setMap(null);
      draggableMarkerRef.current = null;
    }

    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapRef.current,
      draggable: true,
      title: "Drag to position stop",
      icon: {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        fillColor: "#F59E0B",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
        scale: 1.8,
        anchor: new window.google.maps.Point(12, 22),
      },
    });

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) {
        setStopForm((prev) => ({
          ...prev,
          longitude: parseFloat(pos.lng().toFixed(6)),
          latitude: parseFloat(pos.lat().toFixed(6)),
        }));
      }
    });

    draggableMarkerRef.current = marker;

    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(15);
  };

  // Draggable marker lifecycle syncing with Stop Onboard Drawer
  useEffect(() => {
    if (showStopDrawer && mapRef.current) {
      const timer = setTimeout(() => {
        initializeDraggableMarker(stopForm.longitude, stopForm.latitude);
      }, 400);

      const clickListener = mapRef.current.addListener("click", (e: any) => {
        if (!e.latLng) return;
        const lat = parseFloat(e.latLng.lat().toFixed(6));
        const lng = parseFloat(e.latLng.lng().toFixed(6));

        setStopForm((prev) => ({
          ...prev,
          longitude: lng,
          latitude: lat,
        }));

        if (draggableMarkerRef.current) {
          draggableMarkerRef.current.setPosition({ lat, lng });
        }
      });

      return () => {
        clearTimeout(timer);
        if (clickListener) window.google?.maps?.event?.removeListener(clickListener);
        if (draggableMarkerRef.current) {
          draggableMarkerRef.current.setMap(null);
          draggableMarkerRef.current = null;
        }
      };
    } else {
      if (draggableMarkerRef.current) {
        draggableMarkerRef.current.setMap(null);
        draggableMarkerRef.current = null;
      }
    }
  }, [showStopDrawer]);

  // Coordinate manual change triggers
  const handleLatitudeChange = (val: number) => {
    setStopForm((prev) => {
      const next = { ...prev, latitude: val };
      if (draggableMarkerRef.current && !isNaN(val) && !isNaN(prev.longitude)) {
        draggableMarkerRef.current.setPosition({ lat: val, lng: prev.longitude });
      }
      return next;
    });
  };

  const handleLongitudeChange = (val: number) => {
    setStopForm((prev) => {
      const next = { ...prev, longitude: val };
      if (draggableMarkerRef.current && !isNaN(val) && !isNaN(prev.latitude)) {
        draggableMarkerRef.current.setPosition({ lat: prev.latitude, lng: val });
      }
      return next;
    });
  };

  // Google Places Autocomplete Search Handlers
  const handleSearchLocationChange = async (val: string) => {
    setSearchLocation(val);

    if (val.trim().length < 3) {
      setStopSuggestions([]);
      setShowSuggestionsList(false);
      return;
    }

    setIsSearchingStops(true);
    try {
      if (window.google && window.google.maps && window.google.maps.places) {
        const places = window.google.maps.places;
        if (places.AutocompleteService) {
          const service = new places.AutocompleteService();
          service.getPlacePredictions(
            { input: val, componentRestrictions: { country: "ke" } },
            (predictions: any[], status: string) => {
              if (status === "OK" && predictions) {
                const features = predictions.map((p) => ({
                  id: p.place_id,
                  place_name: p.description,
                  text: p.structured_formatting?.main_text || p.description.split(",")[0],
                  place_id: p.place_id,
                }));
                setStopSuggestions(features);
                setShowSuggestionsList(true);
              }
            }
          );
        }
      }
    } catch (err) {
      console.error("Geocoding autocomplete failed:", err);
    } finally {
      setIsSearchingStops(false);
    }
  };

  const handleSelectSuggestion = (feat: any) => {
    setSearchLocation(feat.place_name);

    if (window.google && window.google.maps && feat.place_id) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: feat.place_id }, (results: any[], status: string) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          const lat = parseFloat(loc.lat().toFixed(6));
          const lng = parseFloat(loc.lng().toFixed(6));

          setStopForm((prev) => ({
            ...prev,
            name: feat.text || feat.place_name,
            longitude: lng,
            latitude: lat,
          }));

          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(15);
          }

          if (draggableMarkerRef.current) {
            draggableMarkerRef.current.setPosition({ lat, lng });
          }
        }
      });
    }

    setStopSuggestions([]);
    setShowSuggestionsList(false);
  };

  const handleSchoolNameChange = async (val: string) => {
    setTempSchoolConfig((prev) => ({ ...prev, name: val }));

    if (val.trim().length < 3) {
      setSchoolSuggestions([]);
      setShowSchoolSuggestions(false);
      return;
    }

    setIsSearchingSchool(true);
    try {
      if (window.google && window.google.maps && window.google.maps.places) {
        const service = new window.google.maps.places.AutocompleteService();
        service.getPlacePredictions(
          { input: val, componentRestrictions: { country: "ke" } },
          (predictions: any[], status: string) => {
            if (status === "OK" && predictions) {
              const features = predictions.map((p) => ({
                id: p.place_id,
                place_name: p.description,
                text: p.structured_formatting?.main_text || p.description.split(",")[0],
                place_id: p.place_id,
              }));
              setSchoolSuggestions(features);
              setShowSchoolSuggestions(true);
            }
          }
        );
      }
    } catch (err) {
      console.error("School geocoding autocomplete failed:", err);
    } finally {
      setIsSearchingSchool(false);
    }
  };

  const handleSelectSchoolSuggestion = (feat: any) => {
    if (window.google && window.google.maps && feat.place_id) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: feat.place_id }, (results: any[], status: string) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          const lat = parseFloat(loc.lat().toFixed(6));
          const lng = parseFloat(loc.lng().toFixed(6));

          setTempSchoolConfig((prev) => ({
            ...prev,
            name: feat.text || feat.place_name,
            address: feat.place_name,
            latitude: lat,
            longitude: lng,
          }));

          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(15);
          }

          if (draggableSchoolMarkerRef.current) {
            draggableSchoolMarkerRef.current.setPosition({ lat, lng });
          }
        }
      });
    }

    setSchoolSuggestions([]);
    setShowSchoolSuggestions(false);
  };

  const initializeDraggableSchoolMarker = (lng: number, lat: number) => {
    if (!mapRef.current || !window.google || !window.google.maps) return;

    if (draggableSchoolMarkerRef.current) {
      draggableSchoolMarkerRef.current.setMap(null);
      draggableSchoolMarkerRef.current = null;
    }

    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapRef.current,
      draggable: true,
      title: "Drag to position school campus",
      icon: {
        path: "M12 2L1 9l11 7 9-5.73V17h2V9L12 2zm0 4.28L17.27 9 12 12.36 6.73 9 12 6.28z",
        fillColor: "#4F46E5",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
        scale: 1.8,
      },
    });

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) {
        setTempSchoolConfig((prev) => ({
          ...prev,
          longitude: parseFloat(pos.lng().toFixed(6)),
          latitude: parseFloat(pos.lat().toFixed(6)),
        }));
      }
    });

    draggableSchoolMarkerRef.current = marker;

    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(15);
  };

  useEffect(() => {
    if (showSchoolModal && mapRef.current) {
      const timer = setTimeout(() => {
        initializeDraggableSchoolMarker(tempSchoolConfig.longitude, tempSchoolConfig.latitude);
      }, 400);

      const clickListener = mapRef.current.addListener("click", (e: any) => {
        if (!e.latLng) return;
        const lat = parseFloat(e.latLng.lat().toFixed(6));
        const lng = parseFloat(e.latLng.lng().toFixed(6));

        setTempSchoolConfig((prev) => ({
          ...prev,
          longitude: lng,
          latitude: lat,
        }));

        if (draggableSchoolMarkerRef.current) {
          draggableSchoolMarkerRef.current.setPosition({ lat, lng });
        }
      });

      return () => {
        clearTimeout(timer);
        if (clickListener) window.google?.maps?.event?.removeListener(clickListener);
        if (draggableSchoolMarkerRef.current) {
          draggableSchoolMarkerRef.current.setMap(null);
          draggableSchoolMarkerRef.current = null;
        }
      };
    } else {
      if (draggableSchoolMarkerRef.current) {
        draggableSchoolMarkerRef.current.setMap(null);
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

  // Dynamic route line from stops sequence using Google Directions API (Following Roads)
  const updateRouteLine = async (map: any, currentRouteStops: DBStop[]) => {
    if (!map || !window.google || !window.google.maps) return;

    if (currentRouteStops.length < 2) {
      if (activePolylineRef.current) {
        activePolylineRef.current.setMap(null);
        activePolylineRef.current = null;
      }
      return;
    }

    const validStops = currentRouteStops.filter(
      (s) => s.location && s.location.coordinates && s.location.coordinates.length === 2
    );

    if (validStops.length < 2) return;

    const origin = {
      lat: validStops[0].location.coordinates[1],
      lng: validStops[0].location.coordinates[0],
    };
    const destination = {
      lat: validStops[validStops.length - 1].location.coordinates[1],
      lng: validStops[validStops.length - 1].location.coordinates[0],
    };

    const intermediateStops = validStops.slice(1, -1);
    const waypoints = intermediateStops.slice(0, 23).map((s) => ({
      location: {
        lat: s.location.coordinates[1],
        lng: s.location.coordinates[0],
      },
      stopover: true,
    }));

    const renderPolylineAndFitBounds = (pathCoords: any[]) => {
      if (activePolylineRef.current) {
        activePolylineRef.current.setPath(pathCoords);
      } else {
        activePolylineRef.current = new window.google.maps.Polyline({
          path: pathCoords,
          geodesic: true,
          strokeColor: "#0EA5E9", // Distinct vibrant Electric Cyan for road path
          strokeOpacity: 0.95,
          strokeWeight: 6,
          map: map,
        });
      }

      // Zoom in & fit map bounds to the route
      const bounds = new window.google.maps.LatLngBounds();
      pathCoords.forEach((pt: any) => bounds.extend(pt));
      map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
    };

    const fallbackCoords = validStops.map((s) => ({
      lat: s.location.coordinates[1],
      lng: s.location.coordinates[0],
    }));

    try {
      const directionsService = new window.google.maps.DirectionsService();

      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result: any, status: string) => {
          if (status === "OK" && result && result.routes && result.routes[0]) {
            renderPolylineAndFitBounds(result.routes[0].overview_path);
          } else {
            console.warn(`DirectionsService status (${status}). Falling back to stop sequence path.`);
            renderPolylineAndFitBounds(fallbackCoords);
          }
        }
      );
    } catch (err) {
      console.warn("DirectionsService invocation failed:", err);
      renderPolylineAndFitBounds(fallbackCoords);
    }
  };

  // Google Maps rendering
  useEffect(() => {
    if (!mapContainerRef.current || !currentRoute) return;

    let isMounted = true;

    const initMap = () => {
      if (!mapContainerRef.current || !window.google || !window.google.maps) return;

      const centerCoord = currentRoute.path?.coordinates[0] || [36.8045, -1.2721];

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: centerCoord[1], lng: centerCoord[0] },
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

      updateMapMarkers(map);
      updateRouteLine(map, routeStops);
    };

    if (window.google && window.google.maps) {
      initMap();
    } else {
      const scriptId = "google-maps-js-script-routes";
      let script = document.getElementById(scriptId) as HTMLScriptElement;

      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          googleApiKey
        )}&libraries=places&callback=initGoogleMapsRoutes`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }

    window.initGoogleMapsRoutes = () => {
      if (isMounted) initMap();
    };

    return () => {
      isMounted = false;
    };
  }, [selectedRouteId, routes, googleApiKey]);

  // Update map markers when stops list updates
  const updateMapMarkers = (map: any) => {
    if (!map || !window.google || !window.google.maps) return;

    // Clear old markers
    stopMarkersRef.current.forEach((marker) => marker.setMap(null));
    stopMarkersRef.current = [];

    if (activeTab === "schools") {
      schoolLocations.forEach((loc) => {
        const schoolMarker = new window.google.maps.Marker({
          position: { lat: loc.latitude, lng: loc.longitude },
          map: map,
          title: loc.name,
          icon: {
            url: "/assets/school-location-icon.png",
            scaledSize: new window.google.maps.Size(44, 44),
            origin: new window.google.maps.Point(0, 0),
            anchor: new window.google.maps.Point(22, 22),
          },
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="color:#0f172a; padding:6px; font-family:sans-serif;">
            <h4 style="margin:0 0 2px 0; font-weight:600;">School Campus: ${loc.name}</h4>
            <span style="font-size:0.75rem; color:#64748b;">Coordinates: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}</span>
          </div>`,
        });

        schoolMarker.addListener("click", () => {
          infoWindow.open(map, schoolMarker);
        });

        stopMarkersRef.current.push(schoolMarker);
      });

      if (schoolLocations.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        schoolLocations.forEach((loc) => bounds.extend({ lat: loc.latitude, lng: loc.longitude }));
        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
      }
      return;
    }

    const currentRouteStops = stops
      .filter((s) => s.route_id === selectedRouteId)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    currentRouteStops.forEach((stop, index) => {
      if (!stop.location || !stop.location.coordinates) return;

      const lat = stop.location.coordinates[1];
      const lng = stop.location.coordinates[0];

      const isStart = index === 0;
      const isEnd = index === currentRouteStops.length - 1 && currentRouteStops.length > 1;

      let stopMarker: any;

      if (isStart || isEnd) {
        // Use School Icon image asset for Start and End stops of the route!
        const iconColor = isStart ? "#4F46E5" : "#10B981"; // Indigo for Start, Emerald for End
        const stopTag = isStart ? "START SCHOOL" : "END SCHOOL";

        stopMarker = new window.google.maps.Marker({
          position: { lat, lng },
          map: map,
          title: `${stopTag}: ${stop.name}`,
          icon: {
            url: "/assets/school-location-icon.png",
            scaledSize: new window.google.maps.Size(44, 44),
            origin: new window.google.maps.Point(0, 0),
            anchor: new window.google.maps.Point(22, 22),
          },
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="color:#0f172a; padding:6px; font-family:sans-serif; min-width:170px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
              <span style="background:${iconColor}; color:#ffffff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${stopTag}</span>
              <h4 style="margin:0; font-weight:700; font-size:13px; color:#0f172a;">${stop.name}</h4>
            </div>
            <span style="font-size:11px; color:#64748b;">Stop #${stop.sequence_no} • Geofence: ${stop.geofence_radius_meters}m</span>
          </div>`,
        });

        stopMarker.addListener("click", () => {
          infoWindow.open(map, stopMarker);
        });
      } else {
        // Intermediate stops retain standard numbered circle markers
        stopMarker = new window.google.maps.Marker({
          position: { lat, lng },
          map: map,
          title: stop.name,
          label: {
            text: stop.sequence_no.toString(),
            color: "#FFFFFF",
            fontWeight: "bold",
            fontSize: "12px",
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#6366F1",
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 2,
            scale: 12,
          },
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="color:#0f172a; padding:4px; font-family:sans-serif;">
            <h4 style="margin:0 0 2px 0; font-weight:600;">Stop #${stop.sequence_no}: ${stop.name}</h4>
            <span style="font-size:0.75rem; color:#64748b;">Geofence: ${stop.geofence_radius_meters}m</span>
          </div>`,
        });

        stopMarker.addListener("click", () => {
          infoWindow.open(map, stopMarker);
        });
      }

      stopMarkersRef.current.push(stopMarker);
    });
  };

  // Automatically update map markers and route lines when stops/route change
  useEffect(() => {
    if (mapRef.current) {
      updateMapMarkers(mapRef.current);
      updateRouteLine(mapRef.current, routeStops);
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

  const handleAttachExistingStops = async () => {
    if (!selectedRouteId || selectedAttachIds.length === 0) return;
    setIsAttachLoading(true);
    try {
      const res = await fetch("/api/stops/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_id: selectedRouteId, stop_ids: selectedAttachIds }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) {
        alert(json.error || "Failed to add existing stops to this route.");
        return;
      }
      const stopsRes = await fetch("/api/stops");
      const stopsJson = (await stopsRes.json()) as { success?: boolean; data?: DBStop[] };
      if (stopsJson.success && stopsJson.data) {
        setStops(stopsJson.data);
      }
      setShowAttachStopsModal(false);
      setSelectedAttachIds([]);
      setAttachSearch("");
    } catch (err) {
      console.error("Failed to attach stops:", err);
      alert("Failed to add existing stops to this route.");
    } finally {
      setIsAttachLoading(false);
    }
  };

  // Schedules handlers
  const clearScheduleFieldError = (field: string) => {
    setScheduleFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setScheduleFormSummary(null);
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateScheduleForm({
      name: scheduleForm.name,
      departure_time: scheduleForm.departure_time,
      direction: scheduleForm.direction,
      target_grades: scheduleForm.target_grades,
      days_of_week: scheduleForm.days_of_week,
      route_id: selectedRouteId,
    });
    if (Object.keys(fieldErrors).length > 0) {
      setScheduleFormErrors(fieldErrors);
      setScheduleFormSummary(summarizeMissingScheduleFields(fieldErrors));
      return;
    }
    setScheduleFormErrors({});
    setScheduleFormSummary(null);
    setIsSubmitLoading(true);

    const timeParts = scheduleForm.departure_time.split(":");
    const departureTime = timeParts.length === 2 
      ? `${scheduleForm.departure_time}:00` 
      : scheduleForm.departure_time;

    const tripDirection = scheduleForm.direction as "HOME_TO_SCHOOL" | "SCHOOL_TO_HOME";

    const payload = {
      route_id: selectedRouteId,
      name: scheduleForm.name,
      departure_time: departureTime,
      direction: tripDirection,
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
          direction: "",
          target_grades: [],
          days_of_week: [1, 2, 3, 4, 5],
          vehicle_id: ""
        });
      } else {
        const apiErrors = json.errors as Record<string, string[] | undefined> | undefined;
        const fromFields = formatScheduleApiErrors(apiErrors);
        if (fromFields) {
          const mapped: Record<string, string> = {};
          for (const [key, messages] of Object.entries(apiErrors ?? {})) {
            if (messages && messages[0]) mapped[key] = messages[0];
          }
          setScheduleFormErrors(mapped);
          setScheduleFormSummary(fromFields);
        } else {
          setScheduleFormSummary(json.error || "Could not save this trip. Check the required fields and try again.");
        }
      }
    } catch (err) {
      console.error(err);
      setScheduleFormSummary("Could not save this trip. Check the required fields and try again.");
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
    clearScheduleFieldError("target_grades");
    setScheduleForm(prev => ({
      ...prev,
      target_grades: checked 
        ? [...prev.target_grades, grade]
        : prev.target_grades.filter(g => g !== grade)
    }));
  };

  const handleDayCheckboxChange = (dayNum: number, checked: boolean) => {
    clearScheduleFieldError("days_of_week");
    setScheduleForm(prev => ({
      ...prev,
      days_of_week: checked 
        ? [...prev.days_of_week, dayNum]
        : prev.days_of_week.filter(d => d !== dayNum)
    }));
  };

  const routeStops = stops.filter(s => s.route_id === selectedRouteId).sort((a, b) => a.sequence_no - b.sequence_no);
  const routeSchedules = schedules.filter(s => s.route_id === selectedRouteId);
  const attachableStops = stopsAvailableToAttach(stops, selectedRouteId).filter((stop) => {
    const query = attachSearch.trim().toLowerCase();
    if (!query) return true;
    const routeName = routes.find((route) => route.id === stop.route_id)?.name ?? "";
    return stop.name.toLowerCase().includes(query) || routeName.toLowerCase().includes(query);
  });
  const attachableGroups = groupStopsByRoute(attachableStops, routes);

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
          background: var(--input-bg);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          padding: 10px 12px;
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          transition: all 0.2s ease;
          width: 100%;
        }
        .form-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
          background: var(--input-bg);
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
          background: var(--bg-surface);
          color: var(--text-primary);
        }

        /* Autocomplete Suggestions styling */
        .autocomplete-suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
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
                  onClick={() => router.push("/routes/new")}
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
                          onClick={() => router.push(`/routes/${route.id}/edit`)}
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
              <div 
                ref={mapContainerRef} 
                style={{ height: "350px", width: "100%" }}
              />
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
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => {
                        setSelectedAttachIds([]);
                        setAttachSearch("");
                        setShowAttachStopsModal(true);
                      }}
                      style={{
                        background: "rgba(4, 120, 87, 0.1)",
                        color: "var(--accent-primary-ink)",
                        border: "1px solid rgba(4, 120, 87, 0.25)",
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
                      <ListPlus size={14} />
                      Add existing
                    </button>
                    <button 
                    onClick={() => {
                      const rid = selectedRouteId || currentRoute?.id || "";
                      const qs = new URLSearchParams({ return: "/routes" });
                      if (rid) qs.set("route_id", rid);
                      router.push(`/routes/stops/new?${qs.toString()}`);
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
                  </div>
                ) : activeTab === "schedules" ? (
                  <button 
                    onClick={() => {
                      setScheduleForm({
                        name: "",
                        departure_time: "07:00",
                        direction: "",
                        target_grades: [],
                        days_of_week: [1, 2, 3, 4, 5],
                        vehicle_id: ""
                      });
                      setScheduleDrawerMode("add");
                      setCurrentEditScheduleId(null);
                      setScheduleFormErrors({});
                      setScheduleFormSummary(null);
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
                    No stops assigned to this route yet. Click "Add existing" to use stages you already created, or "Add Route Stop" to create a new one.
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
                          <th style={{ padding: "10px", textAlign: "left", fontSize: "0.75rem", color: "var(--text-muted)" }}>Trip type</th>
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
                              <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-primary)" }}>{tripTypeLabel(sched.direction)}</td>
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
              {scheduleFormSummary && (
                <p role="alert" style={{ fontSize: "0.85rem", color: "var(--state-error)", margin: 0 }}>
                  {scheduleFormSummary}
                </p>
              )}
              <div className="form-group">
                <label className="form-label">Trip Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Early AM Run (Lower Primary)"
                  className="form-input"
                  value={scheduleForm.name}
                  onChange={(e) => {
                    clearScheduleFieldError("name");
                    setScheduleForm(prev => ({ ...prev, name: e.target.value }));
                  }}
                />
                {scheduleFormErrors.name && (
                  <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{scheduleFormErrors.name}</span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Departure Time *</label>
                  <input 
                    type="time" 
                    required
                    className="form-input"
                    value={scheduleForm.departure_time}
                    onChange={(e) => {
                      clearScheduleFieldError("departure_time");
                      setScheduleForm(prev => ({ ...prev, departure_time: e.target.value }));
                    }}
                  />
                  {scheduleFormErrors.departure_time && (
                    <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{scheduleFormErrors.departure_time}</span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Trip type *</label>
                  <div
                    role="radiogroup"
                    aria-label="Trip type"
                    style={{
                      display: "flex",
                      gap: "8px",
                      padding: "8px",
                      borderRadius: "6px",
                      border: scheduleFormErrors.direction ? "1px solid var(--state-error)" : "1px solid var(--border-default)",
                      background: "var(--input-bg)",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer", flex: 1 }}>
                      <input
                        type="radio"
                        name="trip_type"
                        value="HOME_TO_SCHOOL"
                        checked={scheduleForm.direction === "HOME_TO_SCHOOL"}
                        onChange={() => {
                          clearScheduleFieldError("direction");
                          setScheduleForm(prev => ({ ...prev, direction: "HOME_TO_SCHOOL" }));
                        }}
                      />
                      Pick up
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--text-primary)", cursor: "pointer", flex: 1 }}>
                      <input
                        type="radio"
                        name="trip_type"
                        value="SCHOOL_TO_HOME"
                        checked={scheduleForm.direction === "SCHOOL_TO_HOME"}
                        onChange={() => {
                          clearScheduleFieldError("direction");
                          setScheduleForm(prev => ({ ...prev, direction: "SCHOOL_TO_HOME" }));
                        }}
                      />
                      Drop off
                    </label>
                  </div>
                  {scheduleFormErrors.direction && (
                    <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{scheduleFormErrors.direction}</span>
                  )}
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    Pick up is home to school. Drop off is school to home.
                  </span>
                </div>
              </div>

              {/* Target grades selection */}
              <div className="form-group">
                <label className="form-label">Target Grade Classes *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "rgba(0,0,0,0.15)", padding: "10px", borderRadius: "6px", border: scheduleFormErrors.target_grades ? "1px solid var(--state-error)" : "1px solid var(--border-default)" }}>
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
                {scheduleFormErrors.target_grades && (
                  <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{scheduleFormErrors.target_grades}</span>
                )}
              </div>

              {/* Operating days */}
              <div className="form-group">
                <label className="form-label">Operating Days *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", background: "rgba(0,0,0,0.15)", padding: "10px", borderRadius: "6px", border: scheduleFormErrors.days_of_week ? "1px solid var(--state-error)" : "1px solid var(--border-default)" }}>
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
                {scheduleFormErrors.days_of_week && (
                  <span style={{ fontSize: "0.75rem", color: "var(--state-error)" }}>{scheduleFormErrors.days_of_week}</span>
                )}
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

      {showAttachStopsModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(6px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "20px"
        }}>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-xl)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "560px",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 24px",
              borderBottom: "1px solid var(--border-default)",
            }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--text-primary)", margin: 0 }}>
                  Add existing stops
                </h3>
                <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Copies selected stages onto this route. Originals stay on their current route.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAttachStopsModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-default)" }}>
              <input
                className="form-input"
                value={attachSearch}
                onChange={(e) => setAttachSearch(e.target.value)}
                placeholder="Search stop or route name…"
              />
            </div>
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
              {attachableGroups.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No other stops to add. Create a new stop if this stage does not exist yet.
                </p>
              ) : (
                attachableGroups.map((group) => (
                  <div key={group.routeId} style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                      {group.routeName}
                    </p>
                    {group.stops.map((stop) => {
                      const checked = selectedAttachIds.includes(stop.id);
                      return (
                        <label
                          key={stop.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 0",
                            color: "var(--text-primary)",
                            fontSize: "0.9rem",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedAttachIds((prev) =>
                                checked ? prev.filter((id) => id !== stop.id) : [...prev, stop.id],
                              );
                            }}
                          />
                          {stop.name}
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid var(--border-default)" }}>
              <button
                type="button"
                onClick={() => setShowAttachStopsModal(false)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAttachExistingStops()}
                disabled={isAttachLoading || selectedAttachIds.length === 0}
                style={{
                  flex: 2,
                  background: "var(--accent-primary)",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: selectedAttachIds.length === 0 ? "not-allowed" : "pointer",
                  opacity: selectedAttachIds.length === 0 ? 0.6 : 1,
                }}
              >
                {isAttachLoading ? "Adding…" : `Add ${selectedAttachIds.length || ""} selected`}
              </button>
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
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
        Loading Route Planning...
      </div>
    }>
      <RoutesManagement />
    </Suspense>
  );
}

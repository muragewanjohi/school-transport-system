"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Search, Compass, Home, Navigation, Building, Loader2, X } from "lucide-react";
import "mapbox-gl/dist/mapbox-gl.css";

interface HomeLocationMapPickerProps {
  address: string;
  latitude: number;
  longitude: number;
  onAddressChange: (address: string) => void;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
}

interface GeocodingFeature {
  id: string;
  title: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  source?: string;
}

// Instant local Kenya landmarks dataset for 0ms response time
const KNOWN_KENYA_LANDMARKS: GeocodingFeature[] = [
  {
    id: "preset_kicc",
    title: "KICC Tower (Kenyatta International Convention Centre)",
    place_name: "Harambee Avenue, City Square, Central Business District, Nairobi, Kenya",
    center: [36.8231859, -1.2886281],
    source: "Famous Landmark",
  },
  {
    id: "preset_afya",
    title: "Afya Centre",
    place_name: "Tom Mboya Street, Central Business District, Nairobi, Kenya",
    center: [36.8277, -1.2858],
    source: "Famous Landmark",
  },
  {
    id: "preset_nation",
    title: "Nation Centre",
    place_name: "Kimathi Street, Central Business District, Nairobi, Kenya",
    center: [36.8224514, -1.2831792],
    source: "Famous Landmark",
  },
  {
    id: "preset_britam",
    title: "Britam Tower",
    place_name: "Hospital Road, Upper Hill, Nairobi, Kenya",
    center: [36.813216, -1.3000169],
    source: "Famous Landmark",
  },
  {
    id: "preset_times",
    title: "Times Tower",
    place_name: "Haile Selassie Avenue, CBD, Nairobi, Kenya",
    center: [36.8247, -1.2908],
    source: "Famous Landmark",
  },
  {
    id: "preset_yaya",
    title: "Yaya Centre",
    place_name: "Argwings Kodhek Road, Kilimani, Nairobi, Kenya",
    center: [36.7900, -1.2892],
    source: "Shopping Mall",
  },
  {
    id: "preset_tworivers",
    title: "Two Rivers Mall",
    place_name: "Limuru Road, Ruaka / Runda, Nairobi, Kenya",
    center: [36.7933, -1.2069],
    source: "Shopping Mall",
  },
  {
    id: "preset_sarit",
    title: "Sarit Centre",
    place_name: "Karuna Road, Westlands, Nairobi, Kenya",
    center: [36.8048, -1.2642],
    source: "Shopping Mall",
  },
  {
    id: "preset_gardencity",
    title: "Garden City Mall",
    place_name: "Thika Superhighway, Roysambu, Nairobi, Kenya",
    center: [36.8778, -1.2331],
    source: "Shopping Mall",
  },
  {
    id: "preset_kiambu",
    title: "Kiambu Road Stage",
    place_name: "Kiambu Road, Muthaiga / Runda, Nairobi, Kenya",
    center: [36.8335, -1.2185],
    source: "Transit Stage",
  },
];

export default function HomeLocationMapPicker({
  address,
  latitude,
  longitude,
  onAddressChange,
  onLocationChange,
}: HomeLocationMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Search & Autocomplete state
  const [searchQuery, setSearchQuery] = useState(address);
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    "pk.eyJ1IjoibXVyYWdlMTAxIiwiYSI6ImNtcWdiM21mZjA1ZWkycnM3MmpnMXJjeWQifQ.ZmGc4WbWEbgNHPg4jHijzg";

  // Sync internal search query if parent updates address prop externally
  useEffect(() => {
    if (address !== undefined && address !== searchQuery) {
      setSearchQuery(address);
    }
  }, [address]);

  // Click Outside Handler to close autocomplete dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Reverse Geocoding helper (Coordinates -> Building / Place Name)
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
        const nomRes = await fetch(nomUrl, {
          headers: { "User-Agent": "SchoolTrackAdmin/1.0" },
        });
        const nomData = await nomRes.json();

        if (nomData && nomData.display_name) {
          const buildingName =
            nomData.address?.building ||
            nomData.address?.amenity ||
            nomData.address?.shop ||
            nomData.address?.office ||
            nomData.address?.historic ||
            nomData.display_name;

          setSearchQuery(buildingName);
          onAddressChange(buildingName);
          onLocationChange(lat, lng, buildingName);
          return;
        }
      } catch (err) {
        console.warn("Nominatim reverse geocode failed, falling back to Mapbox:", err);
      }

      if (mapboxToken) {
        try {
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&country=ke&limit=1`
          );
          const data = await res.json();
          if (data && data.features && data.features.length > 0) {
            const placeName = data.features[0].place_name;
            setSearchQuery(placeName);
            onAddressChange(placeName);
            onLocationChange(lat, lng, placeName);
          } else {
            onLocationChange(lat, lng);
          }
        } catch (err) {
          console.error("Mapbox reverse geocoding error:", err);
          onLocationChange(lat, lng);
        }
      }
    },
    [mapboxToken, onAddressChange, onLocationChange]
  );

  // Live Autocomplete Search (Instant Local Matches + Nominatim + Mapbox)
  const handleSearchInputChange = async (text: string) => {
    setSearchQuery(text);
    onAddressChange(text);

    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 1. Instant match from known local landmarks list
    const queryLower = text.toLowerCase().trim();
    const localMatches = KNOWN_KENYA_LANDMARKS.filter(
      (item) =>
        item.title.toLowerCase().includes(queryLower) ||
        item.place_name.toLowerCase().includes(queryLower)
    );

    setSuggestions(localMatches);
    setShowSuggestions(true);
    setIsSearching(true);

    const combined: GeocodingFeature[] = [...localMatches];

    try {
      // 2. Fetch from Nominatim Kenya Building/Landmark DB
      const nomPromise = fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          text + ", Kenya"
        )}&format=json&addressdetails=1&limit=6&countrycodes=ke`,
        { headers: { "User-Agent": "SchoolTrackAdmin/1.0" } }
      )
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            data.forEach((item) => {
              const bName =
                item.address?.building ||
                item.address?.amenity ||
                item.address?.shop ||
                item.address?.office ||
                item.address?.historic ||
                item.display_name.split(",")[0];

              combined.push({
                id: "nom_" + item.place_id,
                title: bName,
                place_name: item.display_name,
                center: [parseFloat(item.lon), parseFloat(item.lat)],
                source: "Landmark/Building",
              });
            });
          }
        })
        .catch(() => {});

      // 3. Fetch from Mapbox Geocoding in parallel
      const mapboxPromise = fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          text
        )}.json?access_token=${mapboxToken}&country=ke&proximity=36.8219,-1.2921&autocomplete=true&limit=6`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data && data.features) {
            data.features.forEach((item: any) => {
              combined.push({
                id: item.id,
                title: item.text,
                place_name: item.place_name,
                center: item.center,
                source: "Area/Address",
              });
            });
          }
        })
        .catch(() => {});

      await Promise.all([nomPromise, mapboxPromise]);

      // Deduplicate suggestions
      const uniqueSuggestions: GeocodingFeature[] = [];
      combined.forEach((item) => {
        const isDuplicate = uniqueSuggestions.some(
          (existing) =>
            existing.title.toLowerCase() === item.title.toLowerCase() ||
            (Math.abs(existing.center[0] - item.center[0]) < 0.00015 &&
              Math.abs(existing.center[1] - item.center[1]) < 0.00015)
        );
        if (!isDuplicate) {
          uniqueSuggestions.push(item);
        }
      });

      setSuggestions(uniqueSuggestions);
      setShowSuggestions(true);
    } catch (err) {
      console.error("Geocoding search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle selecting an autocomplete suggestion (Populates building name in input field)
  const handleSelectSuggestion = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center;
    const selectedName = feature.title || feature.place_name;

    // Immediately update input field value
    setSearchQuery(selectedName);
    onAddressChange(selectedName);
    setSuggestions([]);
    setShowSuggestions(false);

    onLocationChange(lat, lng, selectedName);

    // Fly Mapbox map to building location
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 16.5,
        essential: true,
      });
    }
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }
  };

  // Initialize Mapbox Map (Standard Style) & Blue Draggable Home Pin
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isMounted = true;

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (!isMounted || !mapContainerRef.current) return;

      mapboxgl.accessToken = mapboxToken;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/standard", // Mapbox Standard 3D Vector Style
        center: [longitude || 36.8335, latitude || -1.2185],
        zoom: 15,
        interactive: true,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      // Custom Blue Teardrop Home Pin Marker Element
      const el = document.createElement("div");
      el.className = "home-pin-marker-blue";
      el.style.width = "38px";
      el.style.height = "38px";
      el.style.borderRadius = "50% 50% 50% 0";
      el.style.background = "#2563EB"; // Royal Blue
      el.style.border = "2.5px solid #ffffff";
      el.style.transform = "rotate(-45deg)";
      el.style.boxShadow = "0 4px 14px rgba(37, 99, 235, 0.55)";
      el.style.cursor = "grab";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";

      // Home Icon inside pin
      const inner = document.createElement("div");
      inner.style.transform = "rotate(45deg)";
      inner.style.display = "flex";
      inner.style.alignItems = "center";
      inner.style.justifyContent = "center";
      inner.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      `;
      el.appendChild(inner);

      // Create Draggable Marker
      const marker = new mapboxgl.Marker({
        element: el,
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([longitude || 36.8335, latitude || -1.2185])
        .addTo(map);

      // 1. Drag End Event Listener -> Reverse Geocode & Update Input Field
      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        const newLat = parseFloat(lngLat.lat.toFixed(6));
        const newLng = parseFloat(lngLat.lng.toFixed(6));
        reverseGeocode(newLat, newLng);
      });

      // 2. Click to Place Pin Event Listener -> Fly, Reverse Geocode & Update Input Field
      map.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;
        const newLat = parseFloat(lat.toFixed(6));
        const newLng = parseFloat(lng.toFixed(6));

        marker.setLngLat([newLng, newLat]);
        map.flyTo({ center: [newLng, newLat], zoom: 16, essential: true });
        reverseGeocode(newLat, newLng);
      });

      mapRef.current = map;
      markerRef.current = marker;
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Sync marker position when latitude or longitude props update externally
  useEffect(() => {
    if (markerRef.current && latitude && longitude) {
      markerRef.current.setLngLat([longitude, latitude]);
    }
    if (mapRef.current && latitude && longitude) {
      mapRef.current.flyTo({
        center: [longitude, latitude],
        zoom: 15.5,
        essential: true,
      });
    }
  }, [latitude, longitude]);

  return (
    <div style={{ marginBottom: "16px", width: "100%" }}>
      {/* 1. Home Address / Building Autocomplete Field */}
      <div
        ref={containerRef}
        className="form-group"
        style={{ position: "relative", width: "100%", marginBottom: "14px" }}
      >
        <label
          className="form-label"
          style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%" }}
        >
          <Home size={15} style={{ color: "#2563EB" }} />
          HOME ADDRESS / LANDMARK / BUILDING *
        </label>

        <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
          <input
            type="text"
            required
            autoComplete="off"
            name="home_address_landmark_search"
            data-1p-ignore="true"
            data-lpignore="true"
            className="form-input"
            style={{ width: "100%", paddingRight: "40px" }}
            placeholder="Type building name or landmark (e.g. KICC, Afya Center, Nation Center, Britam Tower)..."
            value={searchQuery}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim().length > 0) {
                handleSearchInputChange(searchQuery);
              }
            }}
          />
          {isSearching ? (
            <Loader2
              size={16}
              className="animate-spin"
              style={{
                position: "absolute",
                right: "12px",
                color: "#2563EB",
                pointerEvents: "none",
              }}
            />
          ) : searchQuery ? (
            <X
              size={16}
              style={{
                position: "absolute",
                right: "12px",
                color: "var(--text-muted, #64748B)",
                cursor: "pointer",
              }}
              onClick={() => {
                setSearchQuery("");
                onAddressChange("");
                setSuggestions([]);
                setShowSuggestions(false);
              }}
            />
          ) : (
            <Search
              size={16}
              style={{
                position: "absolute",
                right: "12px",
                color: "var(--text-muted, #64748B)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Autocomplete Dropdown List */}
        {showSuggestions && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              width: "100%",
              zIndex: 999999,
              marginTop: "4px",
              background: "#0F172A",
              border: "1px solid rgba(37, 99, 235, 0.4)",
              borderRadius: "8px",
              boxShadow: "0 14px 35px rgba(0,0,0,0.75)",
              overflow: "hidden",
              maxHeight: "280px",
              overflowY: "auto",
            }}
          >
            {suggestions.length > 0 ? (
              suggestions.map((feature) => (
                <div
                  key={feature.id}
                  onClick={() => handleSelectSuggestion(feature)}
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.825rem",
                    color: "var(--text-primary, #F8FAFC)",
                    cursor: "pointer",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      "rgba(37, 99, 235, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  <Building size={16} style={{ color: "#2563EB", flexShrink: 0 }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>
                        {feature.title}
                      </span>
                      {feature.source && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(37, 99, 235, 0.25)",
                            color: "#60A5FA",
                            fontWeight: 500,
                          }}
                        >
                          {feature.source}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "0.725rem", color: "var(--text-muted, #94A3B8)" }}>
                      {feature.place_name}
                    </span>
                  </div>
                </div>
              ))
            ) : isSearching ? (
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: "0.8rem",
                  color: "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Loader2 size={14} className="animate-spin" style={{ color: "#2563EB" }} />
                <span>Searching Kenya building & landmark database...</span>
              </div>
            ) : (
              <div
                style={{
                  padding: "12px 14px",
                  fontSize: "0.8rem",
                  color: "#94A3B8",
                }}
              >
                No building matches found for "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Coordinates Input Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "12px",
          width: "100%",
        }}
      >
        <div className="form-group">
          <label
            className="form-label"
            style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
          >
            LATITUDE
          </label>
          <input
            type="number"
            name="latitude"
            step="0.000001"
            className="form-input"
            style={{ width: "100%" }}
            value={latitude}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              onLocationChange(val, longitude);
            }}
          />
        </div>
        <div className="form-group">
          <label
            className="form-label"
            style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
          >
            LONGITUDE
          </label>
          <input
            type="number"
            name="longitude"
            step="0.000001"
            className="form-input"
            style={{ width: "100%" }}
            value={longitude}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0;
              onLocationChange(latitude, val);
            }}
          />
        </div>
      </div>

      {/* 3. Nairobi Famous Landmark Quick Pins */}
      <div style={{ marginBottom: "12px", width: "100%" }}>
        <label
          className="form-label"
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "6px",
            display: "block",
          }}
        >
          FAMOUS LANDMARK QUICK PINS (NAIROBI):
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: "100%" }}>
          {[
            { name: "KICC Tower", lat: -1.288628, lng: 36.823185, fullAddr: "KICC Tower, Harambee Avenue, Nairobi" },
            { name: "Afya Centre", lat: -1.2858, lng: 36.8277, fullAddr: "Afya Centre, Tom Mboya Street, Nairobi" },
            { name: "Nation Centre", lat: -1.283179, lng: 36.822451, fullAddr: "Nation Centre, Kimathi Street, Nairobi" },
            { name: "Britam Tower", lat: -1.300016, lng: 36.813216, fullAddr: "Britam Tower, Hospital Road, Upper Hill, Nairobi" },
            { name: "Kiambu Road", lat: -1.2185, lng: 36.8335, fullAddr: "Kiambu Road Stage, Nairobi" },
            { name: "Westlands", lat: -1.2676, lng: 36.8121, fullAddr: "Westlands, Nairobi" },
          ].map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => {
                const addr = preset.fullAddr;
                setSearchQuery(addr);
                onAddressChange(addr);
                onLocationChange(preset.lat, preset.lng, addr);
              }}
              style={{
                background:
                  latitude === preset.lat ? "rgba(37,99,235,0.18)" : "rgba(255,255,255,0.04)",
                border:
                  latitude === preset.lat
                    ? "1px solid #2563EB"
                    : "1px solid var(--border-default, rgba(255,255,255,0.1))",
                color: latitude === preset.lat ? "#2563EB" : "var(--text-primary)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Compass size={12} />
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Draggable Mapbox Map Container (Standard Style) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "250px",
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

        {/* Floating Instruction Banner */}
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            background: "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(6px)",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "0.75rem",
            color: "#3B82F6",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid rgba(59,130,246,0.3)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >
          <Navigation size={14} />
          <span>Click map or drag Blue Home Pin to set location</span>
        </div>
      </div>
    </div>
  );
}

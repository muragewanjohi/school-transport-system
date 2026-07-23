"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Search, Compass, Home, Navigation, Building, Loader2, X } from "lucide-react";

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

// Famous Kenya Landmarks for 0ms instant search fallback
const KNOWN_KENYA_LANDMARKS: GeocodingFeature[] = [
  {
    id: "g_kicc",
    title: "KICC Tower (Kenyatta International Convention Centre)",
    place_name: "Harambee Avenue, City Square, Central Business District, Nairobi, Kenya",
    center: [36.8231859, -1.2886281],
    source: "Google Landmark",
  },
  {
    id: "g_afya",
    title: "Afya Centre",
    place_name: "Tom Mboya Street, Central Business District, Nairobi, Kenya",
    center: [36.8277, -1.2858],
    source: "Google Landmark",
  },
  {
    id: "g_nation",
    title: "Nation Centre",
    place_name: "Kimathi Street, Central Business District, Nairobi, Kenya",
    center: [36.8224514, -1.2831792],
    source: "Google Landmark",
  },
  {
    id: "g_britam",
    title: "Britam Tower",
    place_name: "Hospital Road, Upper Hill, Nairobi, Kenya",
    center: [36.813216, -1.3000169],
    source: "Google Landmark",
  },
  {
    id: "g_times",
    title: "Times Tower",
    place_name: "Haile Selassie Avenue, CBD, Nairobi, Kenya",
    center: [36.8247, -1.2908],
    source: "Google Landmark",
  },
  {
    id: "g_yaya",
    title: "Yaya Centre",
    place_name: "Argwings Kodhek Road, Kilimani, Nairobi, Kenya",
    center: [36.7900, -1.2892],
    source: "Shopping Mall",
  },
  {
    id: "g_tworivers",
    title: "Two Rivers Mall",
    place_name: "Limuru Road, Ruaka / Runda, Nairobi, Kenya",
    center: [36.7933, -1.2069],
    source: "Shopping Mall",
  },
  {
    id: "g_sarit",
    title: "Sarit Centre",
    place_name: "Karuna Road, Westlands, Nairobi, Kenya",
    center: [36.8048, -1.2642],
    source: "Shopping Mall",
  },
  {
    id: "g_gardencity",
    title: "Garden City Mall",
    place_name: "Thika Superhighway, Roysambu, Nairobi, Kenya",
    center: [36.8778, -1.2331],
    source: "Shopping Mall",
  },
  {
    id: "g_kiambu",
    title: "Kiambu Road Stage",
    place_name: "Kiambu Road, Muthaiga / Runda, Nairobi, Kenya",
    center: [36.8335, -1.2185],
    source: "Transit Stage",
  },
];

declare global {
  interface Window {
    google: any;
    initGoogleMapsPicker?: () => void;
  }
}

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
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

  // Google Reverse Geocoding helper (Coordinates -> Building / Address Name)
  const reverseGeocode = useCallback(
    (lat: number, lng: number) => {
      if (window.google && window.google.maps) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
          if (status === "OK" && results && results.length > 0) {
            const formatted = results[0].formatted_address;
            setSearchQuery(formatted);
            onAddressChange(formatted);
            onLocationChange(lat, lng, formatted);
          } else {
            onLocationChange(lat, lng);
          }
        });
      } else {
        // Fallback to Nominatim if script is loading
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.display_name) {
              setSearchQuery(data.display_name);
              onAddressChange(data.display_name);
              onLocationChange(lat, lng, data.display_name);
            } else {
              onLocationChange(lat, lng);
            }
          })
          .catch(() => onLocationChange(lat, lng));
      }
    },
    [onAddressChange, onLocationChange]
  );

  // Live Autocomplete Search using Google Places API + Landmark Database
  const handleSearchInputChange = async (text: string) => {
    setSearchQuery(text);
    onAddressChange(text);

    if (!text.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

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
      // 1. Google Places Autocomplete (supports new 2025/2026 AutocompleteSuggestion and legacy AutocompleteService)
      if (window.google && window.google.maps && window.google.maps.places) {
        const places = window.google.maps.places;

        if (places.AutocompleteSuggestion && typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions === "function") {
          places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: text,
            componentRestrictions: { country: "ke" }
          }).then((response: any) => {
            if (response && response.suggestions) {
              const geocoder = new window.google.maps.Geocoder();
              response.suggestions.forEach((sug: any) => {
                const pPrediction = sug.placePrediction;
                if (pPrediction) {
                  geocoder.geocode({ placeId: pPrediction.placeId }, (geoRes: any[], geoStatus: string) => {
                    if (geoStatus === "OK" && geoRes && geoRes[0]) {
                      const loc = geoRes[0].geometry.location;
                      combined.push({
                        id: "gplace_" + pPrediction.placeId,
                        title: pPrediction.text?.text || pPrediction.mainText?.text || text,
                        place_name: pPrediction.secondaryText?.text ? `${pPrediction.text?.text || text}, ${pPrediction.secondaryText.text}` : text,
                        center: [loc.lng(), loc.lat()],
                        source: "Google Places",
                      });

                      const uniqueSuggestions: GeocodingFeature[] = [];
                      combined.forEach((entry) => {
                        const isDup = uniqueSuggestions.some(
                          (e) =>
                            e.title.toLowerCase() === entry.title.toLowerCase() ||
                            (Math.abs(e.center[0] - entry.center[0]) < 0.0001 &&
                              Math.abs(e.center[1] - entry.center[1]) < 0.0001)
                        );
                        if (!isDup) uniqueSuggestions.push(entry);
                      });
                      setSuggestions(uniqueSuggestions);
                    }
                  });
                }
              });
            }
          }).catch(() => {});
        } else if (places.AutocompleteService) {
          const autocompleteService = new places.AutocompleteService();
          autocompleteService.getPlacePredictions(
            {
              input: text,
              componentRestrictions: { country: "ke" },
            },
            (predictions: any[], status: string) => {
              if (status === "OK" && predictions) {
                const geocoder = new window.google.maps.Geocoder();
                predictions.forEach((item) => {
                  geocoder.geocode({ placeId: item.place_id }, (geoRes: any[], geoStatus: string) => {
                    if (geoStatus === "OK" && geoRes && geoRes[0]) {
                      const loc = geoRes[0].geometry.location;
                      combined.push({
                        id: "gplace_" + item.place_id,
                        title: item.structured_formatting?.main_text || item.description.split(",")[0],
                        place_name: item.description,
                        center: [loc.lng(), loc.lat()],
                        source: "Google Places",
                      });

                      const uniqueSuggestions: GeocodingFeature[] = [];
                      combined.forEach((entry) => {
                        const isDup = uniqueSuggestions.some(
                          (e) =>
                            e.title.toLowerCase() === entry.title.toLowerCase() ||
                            (Math.abs(e.center[0] - entry.center[0]) < 0.0001 &&
                              Math.abs(e.center[1] - entry.center[1]) < 0.0001)
                        );
                        if (!isDup) uniqueSuggestions.push(entry);
                      });
                      setSuggestions(uniqueSuggestions);
                    }
                  });
                });
              }
            }
          );
        }
      }

      // 2. Nominatim Kenya Building DB search in parallel (wrapped safely)
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            text + ", Kenya"
          )}&format=json&addressdetails=1&limit=6&countrycodes=ke`,
          { headers: { "User-Agent": "SchoolTrackAdmin/1.0" } }
        );
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (Array.isArray(nomData)) {
            nomData.forEach((item) => {
              const bName =
                item.address?.building ||
                item.address?.amenity ||
                item.address?.shop ||
                item.address?.office ||
                item.display_name.split(",")[0];

              combined.push({
                id: "nom_" + item.place_id,
                title: bName,
                place_name: item.display_name,
                center: [parseFloat(item.lon), parseFloat(item.lat)],
                source: "Building/Landmark",
              });
            });
          }
        }
      } catch (_) {
        // Silently ignore external CORS/network hiccups
      }

      // Deduplicate suggestions
      const uniqueSuggestions: GeocodingFeature[] = [];
      combined.forEach((entry) => {
        const isDup = uniqueSuggestions.some(
          (e) =>
            e.title.toLowerCase() === entry.title.toLowerCase() ||
            (Math.abs(e.center[0] - entry.center[0]) < 0.00015 &&
              Math.abs(e.center[1] - entry.center[1]) < 0.00015)
        );
        if (!isDup) uniqueSuggestions.push(entry);
      });

      setSuggestions(uniqueSuggestions);
      setShowSuggestions(true);
    } catch (_) {
      // Graceful fallback
    } finally {
      setIsSearching(false);
    }
  };

  // Handle selecting an autocomplete suggestion (Puts Building Name into Input Field & flies Google Map)
  const handleSelectSuggestion = (feature: GeocodingFeature) => {
    const [lng, lat] = feature.center;
    const selectedName = feature.title || feature.place_name;

    setSearchQuery(selectedName);
    onAddressChange(selectedName);
    setSuggestions([]);
    setShowSuggestions(false);

    onLocationChange(lat, lng, selectedName);

    // Update Google Map view & marker
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(16);
    }
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng });
    }
  };

  // Load Google Maps JS Script & Initialize Google Map
  useEffect(() => {
    let isMounted = true;

    const initMapInstance = () => {
      if (!mapContainerRef.current || !window.google || !window.google.maps) return;

      const initialLat = latitude || -1.2185;
      const initialLng = longitude || 36.8335;

      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat: initialLat, lng: initialLng },
        zoom: 15,
        mapTypeId: "roadmap",
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
        ],
      });

      // Draggable Marker with Royal Blue Pin Icon
      const marker = new window.google.maps.Marker({
        position: { lat: initialLat, lng: initialLng },
        map: map,
        draggable: true,
        title: "Drag to set Home Location",
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#2563EB",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 1.8,
          anchor: new window.google.maps.Point(12, 22),
        },
      });

      // 1. Drag End Event Listener -> Reverse Geocode & Update Input Field
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        const newLat = parseFloat(pos.lat().toFixed(6));
        const newLng = parseFloat(pos.lng().toFixed(6));
        reverseGeocode(newLat, newLng);
      });

      // 2. Click Map to Place Pin Listener
      map.addListener("click", (e: any) => {
        const newLat = parseFloat(e.latLng.lat().toFixed(6));
        const newLng = parseFloat(e.latLng.lng().toFixed(6));

        marker.setPosition({ lat: newLat, lng: newLng });
        map.panTo({ lat: newLat, lng: newLng });
        reverseGeocode(newLat, newLng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      if (isMounted) setIsMapLoaded(true);
    };

    if (window.google && window.google.maps) {
      initMapInstance();
    } else {
      const scriptId = "google-maps-js-script";
      let existingScript = document.getElementById(scriptId) as HTMLScriptElement;

      if (!existingScript) {
        existingScript = document.createElement("script");
        existingScript.id = scriptId;
        existingScript.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
          googleApiKey
        )}&libraries=places&callback=initGoogleMapsPicker`;
        existingScript.async = true;
        existingScript.defer = true;
        document.head.appendChild(existingScript);
      }

      window.initGoogleMapsPicker = () => {
        if (isMounted) initMapInstance();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [googleApiKey]);

  // Sync marker & map position when props change externally
  useEffect(() => {
    if (markerRef.current && latitude && longitude) {
      markerRef.current.setPosition({ lat: latitude, lng: longitude });
    }
    if (mapRef.current && latitude && longitude) {
      mapRef.current.panTo({ lat: latitude, lng: longitude });
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
            placeholder="Search Google Maps for building or landmark (e.g. KICC, Afya Centre, Nation Centre, Britam)..."
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
                <span>Searching Google Maps building database...</span>
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
          GOOGLE MAPS LANDMARK QUICK PINS (NAIROBI):
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

      {/* 4. Google Maps Container */}
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
          <span>Click Google Map or drag Blue Home Pin to set location</span>
        </div>
      </div>
    </div>
  );
}

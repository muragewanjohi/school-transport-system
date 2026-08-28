import { describe, expect, it } from "vitest";
import {
  GOOGLE_PLACES_SOURCE,
  mapGooglePlacesResults,
  mergeLocationSuggestions,
} from "@/lib/homeLocationSearch";

describe("mapGooglePlacesResults", () => {
  it("Given Google Places hits, When mapped for the picker, Then source is Google Places and center is lon,lat", () => {
    const mapped = mapGooglePlacesResults([
      {
        title: "Ruaka",
        display_name: "Ruaka, Kiambu, Kenya",
        lat: -1.2045,
        lon: 36.782,
      },
    ]);

    expect(mapped).toEqual([
      {
        id: "gplace_-1.2045_36.782_0",
        title: "Ruaka",
        place_name: "Ruaka, Kiambu, Kenya",
        center: [36.782, -1.2045],
        source: GOOGLE_PLACES_SOURCE,
      },
    ]);
  });
});

describe("mergeLocationSuggestions", () => {
  it("Given suggestion sources, When merged, Then Nominatim is not a source", () => {
    const merged = mergeLocationSuggestions([
      mapGooglePlacesResults([
        { title: "Ruaka", display_name: "Ruaka, Kenya", lat: -1.2, lon: 36.78 },
      ]),
    ]);
    expect(merged.every((item) => item.source === GOOGLE_PLACES_SOURCE)).toBe(true);
    expect(merged.some((item) => /nominatim|openstreetmap/i.test(item.source ?? ""))).toBe(
      false
    );
  });
});

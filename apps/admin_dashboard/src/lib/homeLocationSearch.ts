export type HomeLocationSuggestion = {
  id: string;
  title: string;
  place_name: string;
  center: [number, number];
  source?: string;
};

export type GooglePlacesSearchHit = {
  display_name: string;
  title: string;
  lat: number;
  lon: number;
};

export const GOOGLE_PLACES_SOURCE = "Google Places";

export function mapGooglePlacesResults(
  results: readonly GooglePlacesSearchHit[]
): HomeLocationSuggestion[] {
  return results.map((item, index) => ({
    id: `gplace_${item.lat}_${item.lon}_${index}`,
    title: item.title,
    place_name: item.display_name,
    center: [item.lon, item.lat],
    source: GOOGLE_PLACES_SOURCE,
  }));
}

export function mergeLocationSuggestions(
  lists: readonly HomeLocationSuggestion[][]
): HomeLocationSuggestion[] {
  const unique: HomeLocationSuggestion[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const isDup = unique.some(
        (existing) =>
          existing.title.toLowerCase() === entry.title.toLowerCase() ||
          (Math.abs(existing.center[0] - entry.center[0]) < 0.00015 &&
            Math.abs(existing.center[1] - entry.center[1]) < 0.00015)
      );
      if (!isDup) unique.push(entry);
    }
  }
  return unique;
}

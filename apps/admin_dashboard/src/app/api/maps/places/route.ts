import { NextResponse } from "next/server";
import { z } from "zod";
import { googleMapsServerKey } from "@/lib/googlePolyline";

const querySchema = z.object({
  q: z.string().min(2).max(120),
});

/**
 * Places Autocomplete + Details proxy for Parent relocate search (Kenya-biased).
 */
export async function GET(request: Request) {
  try {
    const key = googleMapsServerKey();
    if (!key) {
      return NextResponse.json(
        { success: false, error: "Google Maps API key is not configured on the server" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const autoUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    autoUrl.searchParams.set("input", parsed.data.q);
    autoUrl.searchParams.set("components", "country:ke");
    autoUrl.searchParams.set("key", key);

    const autoRes = await fetch(autoUrl.toString(), { next: { revalidate: 0 } });
    const autoBody = (await autoRes.json()) as {
      status: string;
      predictions?: Array<{
        place_id: string;
        description: string;
        structured_formatting?: { main_text?: string };
      }>;
    };

    if (autoBody.status !== "OK" && autoBody.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { success: false, error: `Places status: ${autoBody.status}` },
        { status: 502 }
      );
    }

    const predictions = (autoBody.predictions ?? []).slice(0, 6);
    const results: Array<{
      display_name: string;
      title: string;
      lat: number;
      lon: number;
    }> = [];

    for (const prediction of predictions) {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", prediction.place_id);
      detailsUrl.searchParams.set("fields", "geometry,formatted_address,name");
      detailsUrl.searchParams.set("key", key);

      const detRes = await fetch(detailsUrl.toString(), { next: { revalidate: 0 } });
      const detBody = (await detRes.json()) as {
        status: string;
        result?: {
          formatted_address?: string;
          name?: string;
          geometry?: { location?: { lat: number; lng: number } };
        };
      };

      const loc = detBody.result?.geometry?.location;
      if (detBody.status === "OK" && loc) {
        results.push({
          display_name: detBody.result?.formatted_address ?? prediction.description,
          title:
            detBody.result?.name ??
            prediction.structured_formatting?.main_text ??
            prediction.description,
          lat: loc.lat,
          lon: loc.lng,
        });
      }
    }

    return NextResponse.json({ success: true, source: "google_places", data: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

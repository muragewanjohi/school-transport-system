import { NextResponse } from "next/server";
import { z } from "zod";
import { decodeGooglePolyline, googleMapsServerKey } from "@/lib/googlePolyline";

const waypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const bodySchema = z.object({
  waypoints: z.array(waypointSchema).min(2).max(25),
});

/**
 * Proxies Google Directions (driving) for Flutter Driver/Parent apps.
 * Uses the server Maps key so mobile clients never embed unrestricted REST keys.
 */
export async function POST(request: Request) {
  try {
    const key = googleMapsServerKey();
    if (!key) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Maps API key is not configured on the server",
        },
        { status: 503 }
      );
    }

    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, errors: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const points = parsed.data.waypoints;
    const origin = `${points[0].lat},${points[0].lng}`;
    const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
    const intermediates = points.slice(1, -1).slice(0, 23);
    const waypointsParam =
      intermediates.length > 0
        ? intermediates.map((p) => `${p.lat},${p.lng}`).join("|")
        : "";

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("key", key);
    if (waypointsParam) {
      url.searchParams.set("waypoints", waypointsParam);
    }

    const googleRes = await fetch(url.toString(), { next: { revalidate: 0 } });
    const googleBody = (await googleRes.json()) as {
      status: string;
      error_message?: string;
      routes?: Array<{
        overview_polyline?: { points?: string };
        legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
      }>;
    };

    if (googleBody.status !== "OK" || !googleBody.routes?.[0]?.overview_polyline?.points) {
      return NextResponse.json(
        {
          success: false,
          error: googleBody.error_message || `Directions status: ${googleBody.status}`,
          fallback: points,
        },
        { status: 502 }
      );
    }

    const encoded = googleBody.routes[0].overview_polyline.points;
    const path = decodeGooglePolyline(encoded);
    const legs = googleBody.routes[0].legs ?? [];
    const distanceMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
    const durationSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);

    return NextResponse.json({
      success: true,
      source: "google_directions",
      data: {
        points: path,
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { fetchJson } from "./places.server";
import {
  assessRoadConditions,
  roadBounds,
  routePreferences,
  type RoadWay,
  type SafetyEvidence,
} from "./route-comparison";
import { z } from "zod";
import { fetchValhallaRoutes, type InternalRoute } from "./valhalla.server";

export type PlaceHit = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export async function searchGoaPlaces(query: string): Promise<PlaceHit[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + " Goa")}&lat=15.35&lon=73.95&limit=6`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!response.ok) {
    console.error(`Places search failed [${response.status}]`);
    throw new Error("Place search failed. Please try again.");
  }

  const json = z
    .object({
      features: z.array(
        z.object({
          properties: z.object({
            osm_id: z.number(),
            osm_type: z.string().optional(),
            name: z.string().optional(),
            street: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
          }),
          geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
        }),
      ),
    })
    .parse(await response.json());

  return json.features
    .filter((f) => f.properties.state === "Goa")
    .map((f) => ({
      id: `${f.properties.osm_type || "place"}/${f.properties.osm_id}`,
      name: f.properties.name ?? "Unnamed place",
      address:
        [f.properties.street, f.properties.city, f.properties.state].filter(Boolean).join(", ") ||
        "Goa, India",
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
}

export type OSRMStep = {
  name: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string | undefined;
    location?: [number, number] | undefined; // [lng, lat]
    exit?: number | undefined;
  };
};

export type OSRMRoute = InternalRoute;

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverType: string;
  maneuverModifier?: string | undefined;
  name: string;
  location?: [number, number] | undefined; // [lat, lng]
};

export type ScoredRoute = {
  label: string;
  kind: "fastest" | "safer" | "alt";
  distanceKm: number;
  durationMin: number;
  distanceMeters: number;
  durationSeconds: number;
  safety: SafetyEvidence;
  isFastest: boolean;
  isShortest: boolean;
  isSafest: boolean;
  reasons: string[];
  polyline: string;
  summary: string;
  steps: RouteStep[];
  googleMapsUrl: string;
};

function formatManeuverInstruction(step: OSRMStep): string {
  const name = step.name && step.name.trim().length > 0 ? step.name : "the road";
  const modifier = step.maneuver.modifier ? step.maneuver.modifier.replace("-", " ") : "";
  const type = step.maneuver.type;

  switch (type) {
    case "depart":
      return `Head ${modifier || "forward"} on ${name}`;
    case "arrive":
      return `Arrive at your destination`;
    case "turn":
      return `Turn ${modifier || "ahead"} onto ${name}`;
    case "roundabout":
    case "rotary":
      return step.maneuver.exit
        ? `At the roundabout, take exit ${step.maneuver.exit} onto ${name}`
        : `Enter the roundabout and take exit onto ${name}`;
    case "fork":
      return `Take the ${modifier || "next"} fork onto ${name}`;
    case "merge":
      return `Merge ${modifier || ""} onto ${name}`;
    case "on ramp":
      return `Take the ramp onto ${name}`;
    case "off ramp":
      return `Take the exit onto ${name}`;
    case "end of road":
      return `Turn ${modifier || ""} at the end of the road onto ${name}`;
    case "continue":
    case "new name":
    default:
      return modifier && modifier !== "straight"
        ? `Make a ${modifier} onto ${name}`
        : `Continue along ${name}`;
  }
}

function scoreRoute(
  route: InternalRoute,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  safety: SafetyEvidence,
) {
  const durationMin = Math.ceil(route.duration / 60);
  const distanceKm = Math.round(route.distance / 100) / 10;
  const rawSteps = route.legs.flatMap((l) => l.steps || []);
  const precomputedSteps = route.legs.flatMap((l) => l.routeSteps || []);

  const steps: RouteStep[] =
    precomputedSteps.length > 0
      ? precomputedSteps
      : rawSteps.map((s) => ({
          instruction: formatManeuverInstruction(s),
          distanceMeters: Math.round(s.distance ?? 0),
          durationSeconds: Math.round(s.duration ?? 0),
          maneuverType: s.maneuver.type ?? "continue",
          maneuverModifier: s.maneuver.modifier,
          name: s.name || "Road",
          location: s.maneuver.location ? [s.maneuver.location[1], s.maneuver.location[0]] : undefined, // [lat, lng]
        }));

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;

  return {
    durationMin,
    distanceKm,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    safety,
    reasons: [
      ...safety.reasons,
      "Distance and time are compared before rounding. Times exclude live traffic.",
      "Google Maps may choose a different path; the displayed path and turn list are the route assessed here.",
    ],
    summary: route.legs?.[0]?.summary || steps.find((s) => s.name)?.name || "Local Road Route",
    polyline: JSON.stringify(route.geometry.coordinates.map((c) => [c[1], c[0]])),
    steps,
    googleMapsUrl,
  };
}

async function fetchOSRMRoutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<InternalRoute[]> {
  const url = `${(process.env["OSRM_BASE_URL"] || "https://router.project-osrm.org").replace(/\/$/, "")}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=3&steps=true&annotations=nodes,distance`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!response.ok) {
    const body = await response.text();
    console.error(`OSRM routes failed [${response.status}]: ${body}`);
    throw new Error("Could not work out routes for that trip. Please try again.");
  }

  const json = (await response.json()) as {
    code?: string;
    routes?: InternalRoute[];
    waypoints?: { distance: number }[];
  };
  if (json.waypoints?.some((point) => !Number.isFinite(point.distance) || point.distance > 1000)) {
    throw new Error(
      "A location is more than 1 km from a routable road. Choose its road entrance or a nearby accessible starting point.",
    );
  }
  return (json.routes ?? []).filter(
    (route) =>
      Number.isFinite(route.distance) &&
      route.distance >= 0 &&
      Number.isFinite(route.duration) &&
      route.duration >= 0 &&
      route.geometry?.coordinates?.length >= 2 &&
      route.geometry.coordinates.every(
        ([lng, lat]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180,
      ),
  );
}

export async function computeSafeRoutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  isNight: boolean,
): Promise<ScoredRoute[]> {
  const provider = (process.env["ROUTING_PROVIDER"] || "osrm").toLowerCase();
  let raw: InternalRoute[] = [];

  if (provider === "valhalla") {
    try {
      raw = await fetchValhallaRoutes(origin, destination);
      if (raw.length === 0) {
        console.warn("[routing] Valhalla returned 0 routes, falling back to OSRM");
        raw = await fetchOSRMRoutes(origin, destination);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("more than 1 km from a routable road")) {
        throw err;
      }
      console.error("[routing] Valhalla routing failed, falling back to OSRM:", err);
      raw = await fetchOSRMRoutes(origin, destination);
    }
  } else {
    raw = await fetchOSRMRoutes(origin, destination);
  }

  if (raw.length === 0) return [];

  const unique = raw.filter(
    (route, i) =>
      raw.findIndex(
        (r) =>
          JSON.stringify(r.geometry.coordinates) === JSON.stringify(route.geometry.coordinates),
      ) === i,
  );
  let ways: RoadWay[] = [];
  try {
    const points = unique.flatMap((r) =>
      r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    );
    const bounds = roadBounds(points);
    // Bound public-service work for very long trips; unknown coverage is explicit.
    if (
      Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat)) < 1 &&
      Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng)) < 1
    ) {
      const overpass = new URL(
        process.env["OVERPASS_URL"] || "https://overpass-api.de/api/interpreter",
      );
      overpass.searchParams.set("data", `[out:json][timeout:12];way(${bounds})[highway];out body;`);
      const data = z
        .object({
          remark: z.string().optional(),
          elements: z.array(
            z.object({
              id: z.number().optional(),
              nodes: z.array(z.number()),
              tags: z.record(z.string()),
            }),
          ),
        })
        .parse(await fetchJson(overpass.toString(), {}, 16000));
      if (!data.remark) ways = data.elements;
    }
  } catch {
    /* Never substitute fabricated safety scores for missing map data. */
  }
  const candidates = unique.map((r) =>
    scoreRoute(r, origin, destination, assessRoadConditions(r.legs, ways, isNight)),
  );
  const best = routePreferences(candidates);
  return candidates.map((r, i) => ({
    ...r,
    kind: i === best.fastest ? "fastest" : i === best.safest ? "safer" : "alt",
    label: i === best.fastest ? "Fastest available route" : `Alternative ${i + 1}`,
    isFastest: i === best.fastest,
    isShortest: i === best.shortest,
    isSafest: i === best.safest,
  }));
}


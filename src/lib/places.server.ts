import { z } from "zod";
import { distanceKm, distanceToRoute, type Coordinate, type NearbyPlace } from "./geo";

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeout = 15000,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "Safr/1.0 (Goa travel planner; https://github.com/Prajj11/Ideas)");
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeout) });
  if (!response.ok)
    throw new Error(
      `Map service ${new URL(url).hostname} unavailable (${response.status}). Please retry shortly.`,
    );
  return response.json();
}

const photonSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({
        name: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        countrycode: z.string().optional(),
        osm_id: z.number().optional(),
      }),
    }),
  ),
});

export async function locatePlace(place: string, state = "Goa") {
  const result = photonSchema.parse(
    await fetchJson(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(`${place}, ${state}, India`)}&limit=8`,
    ),
  );
  const hit = result.features.find(
    (f) =>
      f.properties.state?.toLowerCase() === state.toLowerCase() &&
      (f.properties.countrycode?.toLowerCase() === "in" || f.properties.country === "India"),
  );
  if (!hit)
    throw new Error(`Could not locate ${place} in ${state}. Try a nearby town or landmark.`);
  return {
    lat: hit.geometry.coordinates[1],
    lng: hit.geometry.coordinates[0],
    name: hit.properties.name || place,
    state: hit.properties.state || state,
  };
}

export async function reverseLocation(point: Coordinate) {
  const result = photonSchema.parse(
    await fetchJson(`https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=1`),
  );
  const hit = result.features[0]?.properties;
  if (!hit?.state || (hit.countrycode?.toLowerCase() !== "in" && hit.country !== "India")) {
    throw new Error(
      "Current-location planning is available in India. Choose a destination and state manually.",
    );
  }
  return { ...point, name: hit.city || hit.name || hit.state, state: hit.state };
}

const overpassSchema = z.object({
  remark: z.string().optional(),
  elements: z.array(
    z.object({
      type: z.enum(["node", "way", "relation"]),
      id: z.number(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string()).optional(),
    }),
  ),
});
const cache = new Map<string, { expires: number; places: NearbyPlace[] }>();

export async function nearbyPlaces(
  center: Coordinate,
  radiusKm = 5,
  path: Coordinate[] = [],
): Promise<NearbyPlace[]> {
  const key = JSON.stringify([center.lat.toFixed(3), center.lng.toFixed(3), radiusKm, path]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.places;
  // A bounding-box lookup is substantially cheaper than Overpass's many-segment
  // around query. Filter the results against the actual road geometry below.
  const latPad = 1.5 / 111.195;
  const lngPad = latPad / Math.max(0.1, Math.cos((center.lat * Math.PI) / 180));
  const around =
    path.length > 1
      ? `${Math.min(...path.map((p) => p.lat)) - latPad},${Math.min(...path.map((p) => p.lng)) - lngPad},${Math.max(...path.map((p) => p.lat)) + latPad},${Math.max(...path.map((p) => p.lng)) + lngPad}`
      : `around:${radiusKm * 1000},${center.lat},${center.lng}`;
  const query = `[out:json][timeout:20];nwr(${around})["name"]->.nearby;(nwr.nearby["amenity"~"^(restaurant|cafe|fast_food|food_court|marketplace|place_of_worship)$"];nwr.nearby["tourism"~"^(hotel|guest_house|hostel|motel|attraction|museum|viewpoint|gallery|zoo|theme_park)$"];nwr.nearby["historic"~"^(castle|fort|monument|ruins|archaeological_site)$"];nwr.nearby["natural"="beach"];);out center tags 500;`;
  const endpoint = process.env["OVERPASS_URL"] || "https://overpass-api.de/api/interpreter";
  const url = new URL(endpoint);
  url.searchParams.set("data", query);
  const result = overpassSchema.parse(await fetchJson(url.toString(), {}, 25000));
  if (result.remark) throw new Error("Nearby-place lookup is busy. Please try again shortly.");
  const seen = new Map<string, Coordinate[]>();
  const places: NearbyPlace[] = [];
  for (const item of result.elements) {
    const tags = item.tags || {};
    const lat = item.lat ?? item.center?.lat,
      lng = item.lon ?? item.center?.lon;
    const name = tags["name"];
    if (
      !name ||
      lat == null ||
      lng == null ||
      tags["access"] === "private" ||
      tags["disused"] === "yes"
    )
      continue;
    const point = { lat, lng };
    const normalized = name.toLowerCase();
    if (seen.get(normalized)?.some((p) => distanceKm(p, point) < 0.15)) continue;
    seen.set(normalized, [...(seen.get(normalized) || []), point]);
    const category = /^(hotel|guest_house|hostel|motel)$/.test(tags["tourism"] || "")
      ? "hotel"
      : /^(restaurant|cafe|fast_food|food_court)$/.test(tags["amenity"] || "")
        ? "restaurant"
        : "attraction";
    const fromRoute = path.length ? distanceToRoute(point, path) : undefined;
    const distance = distanceKm(center, point);
    if (fromRoute != null ? fromRoute > 1.5 : distance > radiusKm) continue;
    places.push({
      ...point,
      id: `${item.type}/${item.id}`,
      name,
      category,
      kind: tags["tourism"] || tags["historic"] || tags["natural"] || tags["amenity"] || "place",
      openingHours: tags["opening_hours"],
      cuisine: tags["cuisine"],
      distanceKm: distance,
      routeDistanceKm: fromRoute,
      sourceUrl: `https://www.openstreetmap.org/${item.type}/${item.id}`,
    });
  }
  places.sort((a, b) => a.distanceKm - b.distanceKm);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 300000, places });
  return places;
}

export async function drivingMatrix(points: Coordinate[]) {
  const base = (process.env["OSRM_BASE_URL"] || "https://router.project-osrm.org").replace(
    /\/$/,
    "",
  );
  const cell = z.number().nonnegative().nullable();
  const result = z
    .object({
      code: z.string(),
      durations: z.array(z.array(cell)).optional(),
      distances: z.array(z.array(cell)).optional(),
      sources: z.array(z.object({ distance: z.number() }).nullable()).optional(),
    })
    .parse(
      await fetchJson(
        `${base}/table/v1/driving/${points.map((p) => `${p.lng},${p.lat}`).join(";")}?annotations=duration,distance`,
      ),
    );
  if (
    result.code !== "Ok" ||
    result.durations?.length !== points.length ||
    result.distances?.length !== points.length
  ) {
    throw new Error(
      "Road travel times are unavailable. Please retry; a timed itinerary cannot be verified without routing.",
    );
  }
  // Reject remote road snaps (e.g. a waterfall across an inaccessible forest).
  const reachable = points.map((_, i) => (result.sources?.[i]?.distance ?? Infinity) <= 1000);
  return { durations: result.durations, distances: result.distances, reachable };
}

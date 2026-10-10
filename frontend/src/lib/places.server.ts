import { z } from "zod";
import {
  distanceKm,
  distanceToRoute,
  type Coordinate,
  type NearbyPlace,
} from "./geo";

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeout = 15000,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set(
    "User-Agent",
    "Safr/1.0 (Goa travel planner; https://github.com/Prajj11/Ideas)",
  );
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeout),
  });
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
        street: z.string().optional(),
        suburb: z.string().optional(),
        locality: z.string().optional(),
        district: z.string().optional(),
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
      (f.properties.countrycode?.toLowerCase() === "in" ||
        f.properties.country === "India"),
  );
  if (!hit)
    throw new Error(
      `Could not locate ${place} in ${state}. Try a nearby town or landmark.`,
    );
  return {
    lat: hit.geometry.coordinates[1],
    lng: hit.geometry.coordinates[0],
    name: hit.properties.name || place,
    state: hit.properties.state || state,
  };
}

export async function reverseLocation(point: Coordinate) {
  const result = photonSchema.parse(
    await fetchJson(
      `https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=1`,
    ),
  );
  const hit = result.features[0]?.properties;
  if (
    !hit?.state ||
    (hit.countrycode?.toLowerCase() !== "in" && hit.country !== "India")
  ) {
    throw new Error(
      "Current-location planning is available in India. Choose a destination and state manually.",
    );
  }
  // Pick specific landmark/street/locality first, falling back to suburb/city/district
  const primary =
    hit.name ||
    hit.street ||
    hit.locality ||
    hit.suburb ||
    hit.city ||
    hit.district;
  const secondary =
    hit.suburb && hit.suburb !== primary
      ? hit.suburb
      : hit.city && hit.city !== primary
        ? hit.city
        : hit.district && hit.district !== primary
          ? hit.district
          : undefined;

  const displayName =
    primary && secondary ? `${primary}, ${secondary}` : primary || hit.state;

  return {
    ...point,
    name: displayName,
    state: hit.state,
  };
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

import { CURATED_GOA_PLACES } from "./goa-places-data";

export async function nearbyPlaces(
  center: Coordinate,
  radiusKm = 5,
  path: Coordinate[] = [],
): Promise<NearbyPlace[]> {
  const key = JSON.stringify([
    center.lat.toFixed(3),
    center.lng.toFixed(3),
    radiusKm,
    path,
  ]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.places;

  // Gather curated places within search range
  const searchLimit = Math.max(radiusKm * 1.5, 15);
  const curatedMatches: NearbyPlace[] = CURATED_GOA_PLACES.map((p) => {
    const dist = distanceKm(center, p);
    const fromRoute = path.length ? distanceToRoute(p, path) : undefined;
    return {
      ...p,
      distanceKm: dist,
      routeDistanceKm: fromRoute,
    };
  }).filter((p) =>
    p.routeDistanceKm != null
      ? p.routeDistanceKm <= 2.5
      : p.distanceKm <= searchLimit,
  );

  // A bounding-box lookup is substantially cheaper than Overpass's many-segment
  // around query. Filter the results against the actual road geometry below.
  const latPad = 1.5 / 111.195;
  const lngPad = latPad / Math.max(0.1, Math.cos((center.lat * Math.PI) / 180));
  const around =
    path.length > 1
      ? `${Math.min(...path.map((p) => p.lat)) - latPad},${Math.min(...path.map((p) => p.lng)) - lngPad},${Math.max(...path.map((p) => p.lat)) + latPad},${Math.max(...path.map((p) => p.lng)) + lngPad}`
      : `around:${radiusKm * 1000},${center.lat},${center.lng}`;
  const query = `[out:json][timeout:20];nwr(${around})["name"]->.nearby;(nwr.nearby["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|nightclub|marketplace|place_of_worship)$"];nwr.nearby["tourism"~"^(hotel|guest_house|hostel|motel|attraction|museum|viewpoint|gallery|zoo|theme_park)$"];nwr.nearby["historic"~"^(castle|fort|monument|ruins|archaeological_site)$"];nwr.nearby["natural"~"^(beach|waterfall)$"];nwr.nearby["leisure"~"^(water_park|sports_centre|park|nature_reserve)$"];);out center tags 500;`;
  const endpoint =
    process.env["OVERPASS_URL"] || "https://overpass-api.de/api/interpreter";
  const url = new URL(endpoint);
  url.searchParams.set("data", query);

  let rawResult: unknown;
  try {
    rawResult = await fetchJson(url.toString(), {}, 25000);
  } catch (err) {
    if (curatedMatches.length > 0) {
      console.warn(
        "Overpass unavailable; using curated destination landmarks.",
      );
      rawResult = { elements: [] };
    } else {
      throw err;
    }
  }

  const result = overpassSchema.parse(rawResult);
  if (result.remark && curatedMatches.length === 0) {
    throw new Error("Nearby-place lookup is busy. Please try again shortly.");
  }

  const seen = new Map<string, Coordinate[]>();
  const places: NearbyPlace[] = [];

  const elements = result.elements || [];
  if (elements.length > 0) {
    for (const item of elements) {
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
      if (seen.get(normalized)?.some((p) => distanceKm(p, point) < 0.2))
        continue;
      seen.set(normalized, [...(seen.get(normalized) || []), point]);
      const category = /^(hotel|guest_house|hostel|motel)$/.test(
        tags["tourism"] || "",
      )
        ? "hotel"
        : /^(restaurant|cafe|fast_food|food_court|bar|pub)$/.test(
              tags["amenity"] || "",
            )
          ? "restaurant"
          : "attraction";
      const fromRoute = path.length ? distanceToRoute(point, path) : undefined;
      const distance = distanceKm(center, point);
      if (fromRoute != null ? fromRoute > 1.5 : distance > radiusKm) continue;
      const kind =
        tags["natural"] === "beach"
          ? "beach"
          : tags["tourism"] ||
            tags["historic"] ||
            tags["natural"] ||
            tags["leisure"] ||
            tags["amenity"] ||
            "place";
      places.push({
        ...point,
        id: `${item.type}/${item.id}`,
        name,
        category,
        kind,
        openingHours: tags["opening_hours"],
        cuisine: tags["cuisine"],
        distanceKm: distance,
        routeDistanceKm: fromRoute,
        sourceUrl: `https://www.openstreetmap.org/${item.type}/${item.id}`,
      });
    }
  } else if (curatedMatches.length > 0) {
    // When Overpass returns 0 elements or failed, use curated landmark database
    for (const c of curatedMatches) {
      places.push(c);
    }
  }
  places.sort((a, b) => a.distanceKm - b.distanceKm);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 300000, places });
  return places;
}

export async function drivingMatrix(points: Coordinate[]) {
  const base = (
    process.env["OSRM_BASE_URL"] || "https://router.project-osrm.org"
  ).replace(/\/$/, "");
  const cell = z.number().nonnegative().nullable();
  const result = z
    .object({
      code: z.string(),
      durations: z.array(z.array(cell)).optional(),
      distances: z.array(z.array(cell)).optional(),
      sources: z
        .array(z.object({ distance: z.number() }).nullable())
        .optional(),
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
  const reachable = points.map(
    (_, i) => (result.sources?.[i]?.distance ?? Infinity) <= 1000,
  );
  return {
    durations: result.durations,
    distances: result.distances,
    reachable,
  };
}

export interface PlaceDetailsResult {
  openingHours?: string | undefined;
  phone?: string | undefined;
  website?: string | undefined;
  cuisine?: string | undefined;
}

export async function getPlaceDetailsServer({
  lat,
  lng,
  name,
}: {
  lat: number;
  lng: number;
  name: string;
}): Promise<PlaceDetailsResult> {
  try {
    const query = `[out:json][timeout:6];nwr(around:50,${lat},${lng})["name"];out tags 15;`;
    const endpoint =
      process.env["OVERPASS_URL"] || "https://overpass-api.de/api/interpreter";
    const url = new URL(endpoint);
    url.searchParams.set("data", query);

    const raw = await fetchJson(url.toString(), {}, 6000);
    const result = overpassSchema.parse(raw);
    const elements = result.elements || [];

    const targetLower = name.trim().toLowerCase();
    const match = elements.find((el) => {
      const elName = (el.tags?.["name"] || "").trim().toLowerCase();
      return elName === targetLower;
    });

    if (!match || !match.tags) {
      return {};
    }

    const tags = match.tags;
    const openingHours = tags["opening_hours"]?.trim() || undefined;
    const phone = (tags["phone"] || tags["contact:phone"])?.trim() || undefined;
    const website =
      (tags["website"] || tags["contact:website"])?.trim() || undefined;
    const cuisine = tags["cuisine"]?.trim() || undefined;

    return {
      openingHours,
      phone,
      website,
      cuisine,
    };
  } catch {
    return {};
  }
}

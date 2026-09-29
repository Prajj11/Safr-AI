import type { Coordinate } from "./geo";
export type RoadWay = { nodes: number[]; tags: Record<string, string> };
export type RoadLeg = { annotation?: { nodes: number[]; distance: number[] } | undefined };
export type SafetyEvidence = {
  coveragePercent: number;
  conditionCoveragePercent: number;
  lightingCoveragePercent: number;
  mappedRiskExposure: number | null;
  sufficient: boolean;
  reasons: string[];
};

export function assessRoadConditions(
  legs: RoadLeg[],
  ways: RoadWay[],
  isNight: boolean,
): SafetyEvidence {
  const edges = new Map<string, Record<string, string>[]>();
  const pair = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const way of ways)
    for (let i = 1; i < way.nodes.length; i++) {
      const key = pair(way.nodes[i - 1]!, way.nodes[i]!);
      edges.set(key, [...(edges.get(key) || []), way.tags]);
    }
  let total = 0,
    mapped = 0,
    known = 0,
    lighting = 0,
    penalty = 0,
    unpaved = 0,
    rough = 0,
    unlit = 0,
    highSpeed = 0;
  for (const leg of legs) {
    const a = leg.annotation;
    if (!a || a.nodes.length !== a.distance.length + 1) continue;
    for (let i = 0; i < a.distance.length; i++) {
      const meters = a.distance[i]!;
      total += meters;
      const matches = edges.get(pair(a.nodes[i]!, a.nodes[i + 1]!));
      // Ambiguous segments remain unknown instead of borrowing a neighbouring road's tags.
      if (!matches || matches.length !== 1) continue;
      const tags = matches[0]!;
      mapped += meters;
      const surface = tags["surface"] || "",
        smoothness = tags["smoothness"] || "",
        lit = tags["lit"] || "";
      const speedTag = tags["maxspeed"] || "";
      const speed = /^\d+(?:\.\d+)?(?: mph)?$/.test(speedTag)
        ? parseFloat(speedTag) * (speedTag.endsWith("mph") ? 1.609344 : 1)
        : null;
      const hasCondition =
        /^(asphalt|concrete|paved|paving_stones|unpaved|gravel|dirt|ground|sand|mud|cobblestone|compacted|fine_gravel)$/.test(
          surface,
        ) ||
        /^(excellent|good|intermediate|bad|very_bad|horrible|very_horrible|impassable)$/.test(
          smoothness,
        ) ||
        speed != null;
      if (hasCondition) known += meters;
      if (lit === "yes" || lit === "no") lighting += meters;
      if (/^(unpaved|gravel|dirt|ground|sand|mud|cobblestone)$/.test(surface)) {
        unpaved += meters;
        penalty += meters * 3;
      }
      if (/^(bad|very_bad|horrible|very_horrible|impassable)$/.test(smoothness)) {
        rough += meters;
        penalty += meters * 4;
      }
      if (speed != null && speed >= 80) {
        highSpeed += meters;
        penalty += meters;
      }
      if (isNight && lit === "no") {
        unlit += meters;
        penalty += meters * 3;
      }
    }
  }
  const percent = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const completeAnnotations =
    legs.length > 0 &&
    legs.every(
      (leg) => leg.annotation && leg.annotation.nodes.length === leg.annotation.distance.length + 1,
    );
  const sufficient =
    completeAnnotations &&
    total > 0 &&
    mapped / total >= 0.9 &&
    known / total >= 0.7 &&
    (!isNight || lighting / total >= 0.7);
  return {
    coveragePercent: percent(mapped),
    conditionCoveragePercent: percent(known),
    lightingCoveragePercent: percent(lighting),
    sufficient,
    mappedRiskExposure: sufficient ? penalty / 1000 : null,
    reasons: [
      `Road segment matching: ${percent(mapped)}%; usable condition tags: ${percent(known)}%${isNight ? `; lighting tags: ${percent(lighting)}%` : ""}.`,
      `Mapped exposure: ${(unpaved / 1000).toFixed(1)} km rough/unpaved surface, ${(rough / 1000).toFixed(1)} km poor smoothness, ${(highSpeed / 1000).toFixed(1)} km posted speed ≥80 km/h${isNight ? `, ${(unlit / 1000).toFixed(1)} km unlit` : ""}. Missing tags are unknown, not safe.`,
      sufficient
        ? "Safety preference estimates mapped surface, smoothness, posted speeds and night lighting. It does not measure crashes, crime, traffic or current hazards."
        : "Insufficient mapped conditions to identify a safest route. No safety score is assigned.",
    ],
  };
}

export function routePreferences<
  T extends { distanceMeters: number; durationSeconds: number; safety: SafetyEvidence },
>(routes: T[]) {
  if (!routes.length) return { fastest: -1, shortest: -1, safest: -1 };
  const indexes = routes.map((_, i) => i);
  const fastest = indexes.reduce((a, b) =>
    routes[b]!.durationSeconds < routes[a]!.durationSeconds ? b : a,
  );
  const shortest = indexes.reduce((a, b) =>
    routes[b]!.distanceMeters < routes[a]!.distanceMeters ? b : a,
  );
  // A safety winner requires multiple comparable candidates and a strictly better result.
  let safest = -1;
  if (routes.length > 1 && routes.every((r) => r.safety.sufficient)) {
    const ordered = [...indexes].sort(
      (a, b) => routes[a]!.safety.mappedRiskExposure! - routes[b]!.safety.mappedRiskExposure!,
    );
    if (
      routes[ordered[0]!]!.safety.mappedRiskExposure! <
      routes[ordered[1]!]!.safety.mappedRiskExposure!
    )
      safest = ordered[0]!;
  }
  return { fastest, shortest, safest };
}

export function roadBounds(points: Coordinate[]) {
  return `${Math.min(...points.map((p) => p.lat)) - 0.002},${Math.min(...points.map((p) => p.lng)) - 0.002},${Math.max(...points.map((p) => p.lat)) + 0.002},${Math.max(...points.map((p) => p.lng)) + 0.002}`;
}

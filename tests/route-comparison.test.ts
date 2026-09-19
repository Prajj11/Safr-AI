import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRoadConditions, routePreferences } from "../src/lib/route-comparison.ts";
import { computeSafeRoutes } from "../src/lib/maps.server.ts";
const legs = [{ annotation: { nodes: [1, 2, 3], distance: [100, 100] } }];
const paved = assessRoadConditions(
  legs,
  [{ nodes: [1, 2, 3], tags: { surface: "asphalt", lit: "yes", maxspeed: "40" } }],
  false,
);
const rough = assessRoadConditions(
  legs,
  [{ nodes: [1, 2, 3], tags: { surface: "gravel", lit: "no", maxspeed: "80" } }],
  false,
);

test("shortest and fastest compare unrounded meters and seconds independently", () => {
  const best = routePreferences([
    { distanceMeters: 1001, durationSeconds: 61, safety: paved },
    { distanceMeters: 1000, durationSeconds: 62, safety: rough },
  ]);
  assert.equal(best.fastest, 0);
  assert.equal(best.shortest, 1);
  assert.equal(best.safest, 0);
});
test("missing road tags never become a perfect safety score", () => {
  const unknown = assessRoadConditions(
    legs,
    [{ nodes: [1, 2, 3], tags: { highway: "residential" } }],
    false,
  );
  assert.equal(unknown.sufficient, false);
  assert.equal(unknown.mappedRiskExposure, null);
  assert.equal(
    routePreferences([
      { distanceMeters: 1, durationSeconds: 1, safety: paved },
      { distanceMeters: 2, durationSeconds: 2, safety: unknown },
    ]).safest,
    -1,
  );
});
test("night comparison needs actual lighting tags", () => {
  const ways = [{ nodes: [1, 2, 3], tags: { surface: "asphalt" } }];
  assert.equal(assessRoadConditions(legs, ways, false).sufficient, true);
  assert.equal(assessRoadConditions(legs, ways, true).sufficient, false);
});
test("unrelated nearby roads cannot contribute safety evidence", () => {
  const evidence = assessRoadConditions(
    legs,
    [{ nodes: [4, 5, 6], tags: { surface: "asphalt", lit: "yes" } }],
    true,
  );
  assert.equal(evidence.coveragePercent, 0);
  assert.equal(evidence.sufficient, false);
});
test("missing annotations in any leg invalidate coverage-based ranking", () => {
  assert.equal(
    assessRoadConditions([...legs, {}], [{ nodes: [1, 2, 3], tags: { surface: "asphalt" } }], false)
      .sufficient,
    false,
  );
});
test("one route and tied safety evidence do not invent a safer winner", () => {
  const route = { distanceMeters: 100, durationSeconds: 10, safety: paved };
  assert.deepEqual(routePreferences([route]), { fastest: 0, shortest: 0, safest: -1 });
  assert.equal(routePreferences([route, route]).safest, -1);
});
test("safety compares total weighted exposure instead of diluting it with extra distance", () => {
  assert.ok(rough.mappedRiskExposure! > paved.mappedRiskExposure!);
  const twice = assessRoadConditions(
    [{ annotation: { nodes: [1, 2, 3], distance: [200, 200] } }],
    [{ nodes: [1, 2, 3], tags: { surface: "gravel", maxspeed: "80" } }],
    false,
  );
  assert.equal(twice.mappedRiskExposure, rough.mappedRiskExposure! * 2);
});
test("live-route adapter deduplicates geometry and retains route when safety service fails", async (t) => {
  const route = {
    distance: 1234,
    duration: 99,
    geometry: {
      coordinates: [
        [73.8, 15.4],
        [73.81, 15.41],
      ],
    },
    legs: [{ ...legs[0], steps: [] }],
  };
  t.mock.method(globalThis, "fetch", async (url: string) =>
    String(url).includes("/route/")
      ? Response.json({ routes: [route, route] })
      : new Response("busy", { status: 503 }),
  );
  const result = await computeSafeRoutes(
    { lat: 15.4, lng: 73.8 },
    { lat: 15.41, lng: 73.81 },
    false,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]!.distanceMeters, 1234);
  assert.equal(result[0]!.isFastest, true);
  assert.equal(result[0]!.isShortest, true);
  assert.equal(result[0]!.isSafest, false);
  assert.equal(result[0]!.safety.sufficient, false);
});

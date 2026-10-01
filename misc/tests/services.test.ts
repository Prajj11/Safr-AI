import { test } from "node:test";
import assert from "node:assert/strict";
import { buildItinerary } from "../../frontend/src/lib/travel.server.ts";
import { locatePlace, nearbyPlaces, drivingMatrix } from "../../frontend/src/lib/places.server.ts";

const input = {
  place: "Panjim",
  state: "Goa",
  hours: 1,
  pace: "balanced" as const,
  interests: ["History & heritage"],
  startTime: "09:00",
  origin: { lat: 15.4, lng: 73.8 },
};
const osm = {
  elements: [
    {
      type: "node",
      id: 41,
      lat: 15.4001,
      lon: 73.8001,
      tags: { name: "Museum", tourism: "museum" },
    },
  ],
};
const table = {
  code: "Ok",
  sources: [{ distance: 2 }, { distance: 3 }],
  durations: [
    [0, 300],
    [300, 0],
  ],
  distances: [
    [0, 1500],
    [1500, 0],
  ],
};

test("AI failure still returns a grounded, budgeted plan with explicit fallback", async (t) => {
  const previous = process.env["GEMINI_API_KEY"];
  process.env["GEMINI_API_KEY"] = "test-key";
  t.after(() => {
    if (previous == null) delete process.env["GEMINI_API_KEY"];
    else process.env["GEMINI_API_KEY"] = previous;
  });
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("generativelanguage")) return new Response("{}", { status: 429 });
    return Response.json(url.includes("/table/") ? table : osm);
  });
  const plan = await buildItinerary(input);
  assert.equal(plan.aiStatus, "unavailable");
  assert.equal(plan.totalMinutes, 60);
  assert.equal(plan.stops[0]!.title, "Museum");
  assert.equal(plan.stops[0]!.distanceKm, 1.5);
  assert.equal(plan.liveSwell, undefined);
});
test("AI cannot introduce invented place IDs or timings", async (t) => {
  process.env["GEMINI_API_KEY"] = "test-key";
  t.after(() => delete process.env["GEMINI_API_KEY"]);
  t.mock.method(globalThis, "fetch", async (url: string) =>
    Response.json(
      url.includes("generativelanguage")
        ? {
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ orderedIds: ["made-up-id"], time: "01:00" }) }],
                },
              },
            ],
          }
        : url.includes("/table/")
          ? table
          : osm,
    ),
  );
  const plan = await buildItinerary({ ...input, origin: { lat: 15.4002, lng: 73.8002 } });
  assert.equal(plan.aiStatus, "unavailable");
  assert.equal(plan.stops[0]!.arrivalMinute, 555);
});
test("valid AI rankings do not control visit or road times", async (t) => {
  process.env["GEMINI_API_KEY"] = "test-key";
  t.after(() => delete process.env["GEMINI_API_KEY"]);
  t.mock.method(globalThis, "fetch", async (url: string) =>
    Response.json(
      url.includes("generativelanguage")
        ? { candidates: [{ content: { parts: [{ text: '{"orderedIds":["node/41"]}' }] } }] }
        : url.includes("/table/")
          ? table
          : osm,
    ),
  );
  const plan = await buildItinerary({ ...input, hours: 2 });
  assert.equal(plan.aiStatus, "used");
  assert.equal(plan.stops[0]!.durationMin, 50);
  assert.equal(plan.stops[0]!.transitMin, 15);
});
test("map provider failure does not fabricate an itinerary", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  await assert.rejects(
    () => buildItinerary({ ...input, origin: { lat: 16, lng: 74 } }),
    /unavailable/,
  );
});
test("geocoder refuses wrong-state matches rather than defaulting to Panjim", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      features: [
        {
          geometry: { coordinates: [73, 19] },
          properties: { name: "A place", state: "Maharashtra", country: "India" },
        },
      ],
    }),
  );
  await assert.rejects(() => locatePlace("Missing town", "Goa"), /Could not locate/);
});
test("OSRM no-route response fails explicitly", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "NoTable" }));
  await assert.rejects(() => drivingMatrix([input.origin]), /unavailable/);
});
test("empty nearby results stay empty rather than creating generic businesses", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ elements: [] }));
  assert.deepEqual(await nearbyPlaces({ lat: 17, lng: 75 }, 2), []);
});

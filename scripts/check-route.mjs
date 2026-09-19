process.loadEnvFile();
const { computeSafeRoutes } = await import("../src/lib/maps.server.ts");
const { nearbyPlaces } = await import("../src/lib/places.server.ts");
const center = { lat: 15.4989, lng: 73.8278 };
try {
  const routes = await computeSafeRoutes(center, { lat: 15.5553, lng: 73.7517 }, false);
  if (!routes.length) throw new Error("No road route found");
  const points = JSON.parse(routes[0].polyline);
  const stride = Math.max(1, Math.ceil(points.length / 198));
  const path = points
    .filter((_, i) => i % stride === 0 || i === points.length - 1)
    .map(([lat, lng]) => ({ lat, lng }));
  const places = await nearbyPlaces(center, 5, path);
  console.log(
    JSON.stringify(
      {
        routes: routes.length,
        pathPoints: path.length,
        distanceKm: routes[0].distanceKm,
        places: places.length,
        categories: Object.fromEntries(
          ["restaurant", "hotel", "attraction"].map((category) => [
            category,
            places.filter((p) => p.category === category).length,
          ]),
        ),
        insideCorridor: places.every((p) => p.routeDistanceKm <= 1.5),
      },
      null,
      2,
    ),
  );
  if (!places.length) throw new Error("No route hotspots returned");
} catch (error) {
  console.log(`Route check failed: ${error.message}`);
  process.exitCode = 1;
}

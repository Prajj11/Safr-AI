import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import type { Map as LeafletMap } from "leaflet";
import { getNearbyPlaces } from "@/lib/goa.functions";
import { distanceKm, type Coordinate, type NearbyPlace } from "@/lib/geo";
import { Button } from "@/components/ui/button";

export function NearbyPlaces({
  center,
  polyline,
  map,
}: {
  center: Coordinate;
  polyline?: string | undefined;
  map?: LeafletMap | null | undefined;
}) {
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [tracking, setTracking] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [category, setCategory] = useState("all");
  const [radius, setRadius] = useState(5);
  const nearby = useServerFn(getNearbyPlaces);
  const path = useMemo(() => {
    if (!polyline) return [];
    const points = JSON.parse(polyline) as [number, number][];
    const stride = Math.max(1, Math.ceil(points.length / 198));
    return points
      .filter((_, i) => i % stride === 0 || i === points.length - 1)
      .map(([lat, lng]) => ({ lat, lng }));
  }, [polyline]);
  useEffect(() => {
    if (!tracking) return;
    if (!navigator.geolocation) {
      setGpsError("Location is unavailable in this browser.");
      setTracking(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGpsError("");
      },
      (error) => {
        setGpsError(
          error.code === 1
            ? "Location permission denied. Enable it in your browser to follow nearby places."
            : "Location unavailable. Showing places around the route start.",
        );
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [tracking]);
  const anchor = position || center;
  // Quantization avoids a new network request for every small GPS movement.
  const queryCenter = {
    lat: Math.round(anchor.lat * 200) / 200,
    lng: Math.round(anchor.lng * 200) / 200,
  };
  const places = useQuery({
    queryKey: ["nearby-places", path, path.length ? center : queryCenter, radius],
    queryFn: () =>
      nearby({ data: { center: path.length ? center : queryCenter, path, radiusKm: radius } }),
    staleTime: 300000,
    retry: 1,
  });
  const visible = useMemo(
    () =>
      (places.data || [])
        .map((p) => ({ ...p, distanceKm: distanceKm(anchor, p) }))
        .filter(
          (p) =>
            (category === "all" || p.category === category) &&
            (!tracking || p.distanceKm <= radius),
        )
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 24),
    [places.data, anchor, category, radius, tracking],
  );
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let layer: import("leaflet").LayerGroup | undefined;
    void import("leaflet").then((L) => {
      if (cancelled) return;
      layer = L.layerGroup().addTo(map);
      for (const p of visible) {
        const popup = document.createElement("div");
        popup.textContent = `${p.name} · ${p.category} · ${p.distanceKm.toFixed(1)} km away`;
        L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color:
            p.category === "restaurant"
              ? "#ea580c"
              : p.category === "hotel"
                ? "#7c3aed"
                : "#0d9488",
          fillOpacity: 0.8,
        })
          .bindPopup(popup)
          .addTo(layer);
      }
      if (position)
        L.circleMarker([position.lat, position.lng], { radius: 9, color: "#2563eb" })
          .bindPopup("Your latest location")
          .addTo(layer);
    });
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, visible, position]);
  return (
    <section className="my-5 rounded-3xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">
            {path.length ? "Hotspots along your route" : "Discover places nearby"}
          </h2>
          <p className="text-xs text-muted-foreground">
            OpenStreetMap listings · Distances are straight-line estimates
            {path.length ? " · Within 1.5 km of the route" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTracking(!tracking);
            if (tracking) setPosition(null);
          }}
        >
          {tracking ? "Stop location updates" : "Follow my location"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Show{" "}
          <select
            aria-label="Place category"
            className="rounded-lg bg-secondary p-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All places</option>
            <option value="attraction">Places to visit</option>
            <option value="restaurant">Restaurants</option>
            <option value="hotel">Hotels</option>
          </select>
        </label>
        <label className="text-sm">
          Nearby radius{" "}
          <select
            aria-label="Proximity radius"
            className="rounded-lg bg-secondary p-2"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          >
            {[1, 3, 5, 10, 15].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
      </div>
      {gpsError && (
        <p role="alert" className="text-sm text-destructive">
          {gpsError}
        </p>
      )}
      {tracking && (
        <p role="status" className="text-xs text-primary">
          {position
            ? "Nearby distances update as you move. Location updates stop when you leave this page."
            : "Waiting for your location…"}
        </p>
      )}
      {places.isPending ? (
        <p role="status">Looking up nearby places…</p>
      ) : places.isError ? (
        <div role="alert">
          <p>Nearby places could not be loaded.</p>
          <Button variant="outline" onClick={() => void places.refetch()}>
            Try again
          </Button>
        </div>
      ) : !visible.length ? (
        <p>No mapped places match these filters. Try a larger radius or another category.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p: NearbyPlace) => (
            <article key={p.id} className="rounded-2xl bg-secondary/40 p-4 space-y-2">
              <button
                className="text-left font-semibold hover:underline"
                onClick={() => map?.setView([p.lat, p.lng], 16)}
              >
                {p.name}
              </button>
              <p className="text-xs capitalize">
                {p.category} · {p.distanceKm.toFixed(1)} km away
                {p.routeDistanceKm != null
                  ? ` · ${p.routeDistanceKm.toFixed(1)} km from route`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.openingHours ? `Listed hours: ${p.openingHours}` : "Opening hours unavailable"}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-primary">
                <Link to="/map" search={{ dest: p.name, lat: String(p.lat), lng: String(p.lng) }}>
                  Directions
                </Link>
                <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                  View listing
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

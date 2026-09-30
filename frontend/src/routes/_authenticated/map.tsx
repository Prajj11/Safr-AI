import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Compass,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  ListOrdered,
  Loader2,
  LocateFixed,
  MapPin,
  Milestone,
  Moon,
  MoveUp,
  Navigation,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Split,
  Sun,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeolocateControl, IControl } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRoutes, searchPlaces } from "@/lib/maps.functions";
import { getCurrentArea } from "@/lib/goa.functions";
import type { RouteStep } from "@/lib/goa-schemas";
import {
  MAP_STYLES,
  GOA_CENTER,
  GOA_BOUNDS,
  getDefaultStyleId,
  addCustomLayers,
  ORIGIN_MARKER_SVG,
  DESTINATION_MARKER_SVG,
  stepMarkerSvg,
  injectMapCSS,
  type MapStyleEntry,
} from "@/lib/map-config";

export const Route = createFileRoute("/_authenticated/map")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    dest?: string;
    lat?: string;
    lng?: string;
    origin?: string;
    originLat?: string;
    originLng?: string;
  } => {
    const params: {
      dest?: string;
      lat?: string;
      lng?: string;
      origin?: string;
      originLat?: string;
      originLng?: string;
    } = {};
    if (typeof search["dest"] === "string" && search["dest"]) params.dest = search["dest"];
    if (typeof search["lat"] === "string" && search["lat"]) params.lat = search["lat"];
    if (typeof search["lng"] === "string" && search["lng"]) params.lng = search["lng"];
    if (typeof search["origin"] === "string" && search["origin"]) params.origin = search["origin"];
    if (typeof search["originLat"] === "string" && search["originLat"])
      params.originLat = search["originLat"];
    if (typeof search["originLng"] === "string" && search["originLng"])
      params.originLng = search["originLng"];
    return params;
  },
  component: MapPage,
});

type Hit = { id: string; name: string; address: string; lat: number; lng: number };
type Scored = import("@/lib/maps.server").ScoredRoute;

const DEFAULT_ORIGIN = { lat: 15.4989, lng: 73.8278 };

const QUICK_DESTINATIONS: Hit[] = [
  { id: "q1", name: "Baga Beach", address: "North Goa", lat: 15.5553, lng: 73.7517 },
  { id: "q2", name: "Fort Aguada", address: "Candolim, Goa", lat: 15.4925, lng: 73.7736 },
  { id: "q3", name: "Palolem Beach", address: "Canacona, South Goa", lat: 15.01, lng: 74.0232 },
  { id: "q4", name: "Dudhsagar Falls", address: "Sanguem, Goa", lat: 15.3144, lng: 74.3144 },
  { id: "q5", name: "Panjim Church", address: "Fontainhas, Panaji", lat: 15.4989, lng: 73.8278 },
];

function getManeuverIcon(type: string, modifier?: string) {
  if (type === "arrive") return <Flag className="size-4 text-emerald" />;
  if (type === "roundabout" || type === "rotary")
    return <RotateCcw className="size-4 text-amber" />;
  if (type === "fork" || type === "merge") return <Split className="size-4 text-cyan" />;
  if (modifier?.includes("left")) return <CornerUpLeft className="size-4 text-primary" />;
  if (modifier?.includes("right")) return <CornerUpRight className="size-4 text-coral" />;
  return <MoveUp className="size-4 text-primary" />;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
}

// ---------------------------------------------------------------------------
// Route color helpers
// ---------------------------------------------------------------------------

function routeColor(kind: string, isSelected: boolean): string {
  if (!isSelected) return "#94a3b8";
  if (kind === "safer") return "#10b981";
  if (kind === "alt") return "#06b6d4";
  return "#f97316";
}

// ---------------------------------------------------------------------------
// MapPage component
// ---------------------------------------------------------------------------

function MapPage() {
  const searchParams = Route.useSearch();
  const requestedTarget = useRef("");
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const originMarkerRef = useRef<MapLibreMarker | null>(null);
  const destMarkerRef = useRef<MapLibreMarker | null>(null);
  const stepMarkerRef = useRef<MapLibreMarker | null>(null);
  const geolocateRef = useRef<GeolocateControl | null>(null);

  const [originLabel, setOriginLabel] = useState("Detecting location…");
  const [locationReady, setLocationReady] = useState(false);
  const [isGpsOrigin, setIsGpsOrigin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showOriginSearch, setShowOriginSearch] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [originHits, setOriginHits] = useState<Hit[]>([]);

  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [query, setQuery] = useState(searchParams.dest || "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [routes, setRoutes] = useState<Scored[]>([]);
  const [selected, setSelected] = useState(0);
  const [destination, setDestination] = useState<Hit | null>(null);
  const [showDirections, setShowDirections] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  // Map style & 3D state (session only, no localStorage)
  const [activeStyleId, setActiveStyleId] = useState(getDefaultStyleId);
  const [is3d, setIs3d] = useState(false);

  const currentHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const isNightTime = currentHour >= 19 || currentHour < 6;

  const search = useServerFn(searchPlaces);
  const route = useServerFn(getRoutes);
  const currentArea = useServerFn(getCurrentArea);

  const originSearchMutation = useMutation({
    mutationFn: async (q: string) => (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setOriginHits(data);
      if (data.length === 0) toast.info("No matching starting places found.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Origin search failed"),
  });

  const requestUserLocation = (isAutomatic = false) => {
    if (!navigator.geolocation) {
      if (!isAutomatic) {
        toast.error("Geolocation is not supported by your browser");
      }
      setLocationReady(true);
      setOriginLabel("Panjim (default fallback)");
      return;
    }

    setLocating(true);

    const applyLocation = async (lat: number, lng: number) => {
      const coords = { lat, lng };
      setOrigin(coords);
      setIsGpsOrigin(true);
      setLocationReady(true);
      setLocating(false);

      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 13 });
      }

      let label = "Your Location";
      try {
        const area = await currentArea({ data: coords });
        if (area?.name) {
          label = `${area.name} (Your Location)`;
        }
      } catch {
        label = `Your Location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
      }
      setOriginLabel(label);

      try {
        localStorage.setItem(
          "safr_last_origin",
          JSON.stringify({ coords, label, isGps: true }),
        );
      } catch {
        // localStorage unavailable
      }

      if (!isAutomatic) {
        toast.success(`Starting point updated to ${label}`);
      }

      if (destination) {
        routeMutation.mutate(destination);
      }
    };

    const handleFailure = (err?: GeolocationPositionError) => {
      if (err && err.code === err.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
          () => {
            setLocating(false);
            setLocationReady(true);
            setOriginLabel((prev) =>
              prev.startsWith("Detecting") ? "Panjim (default starting point)" : prev,
            );
            if (!isAutomatic) {
              toast.error("Could not acquire GPS fix. Please select a starting point manually.");
            }
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
        );
        return;
      }

      setLocating(false);
      setLocationReady(true);
      setOriginLabel((prev) =>
        prev.startsWith("Detecting") ? "Panjim (default starting point)" : prev,
      );
      if (!isAutomatic) {
        if (err?.code === err?.PERMISSION_DENIED) {
          toast.error(
            "Location permission was denied. Please allow location access in your browser settings.",
          );
        } else {
          toast.error("Unable to retrieve location. Using Panjim as fallback.");
        }
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
      handleFailure,
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
    );
  };

  // -----------------------------------------------------------------------
  // addRouteDataToMap — re-adds route sources/layers to the current map
  // -----------------------------------------------------------------------

  const routesRef = useRef(routes);
  const selectedRef = useRef(selected);
  routesRef.current = routes;
  selectedRef.current = selected;

  const addRouteDataToMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const curRoutes = routesRef.current;
    const curSelected = selectedRef.current;

    // Clean up any existing route layers/sources
    for (let i = 0; i < 10; i++) {
      try { map.removeLayer(`safr-route-arrows-${i}`); } catch { /* */ }
      try { map.removeLayer(`safr-route-line-${i}`); } catch { /* */ }
      try { map.removeLayer(`safr-route-casing-${i}`); } catch { /* */ }
      try { map.removeSource(`safr-route-${i}`); } catch { /* */ }
    }

    curRoutes.forEach((r, i) => {
      if (!r.polyline) return;
      try {
        const pathCoords = JSON.parse(r.polyline) as [number, number][];
        if (!pathCoords || pathCoords.length === 0) return;

        // polyline is stored as [lat, lng] pairs — MapLibre uses [lng, lat]
        const coords = pathCoords.map(([lat, lng]) => [lng, lat] as [number, number]);

        const sourceId = `safr-route-${i}`;
        const geojson: FeatureCollection = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            },
          ],
        };

        map.addSource(sourceId, { type: "geojson", data: geojson });

        const color = routeColor(r.kind, i === curSelected);
        const isSelected = i === curSelected;

        // Casing (dark outline)
        map.addLayer({
          id: `safr-route-casing-${i}`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": isSelected ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.1)",
            "line-width": isSelected ? 9 : 5,
            "line-opacity": isSelected ? 1 : 0.35,
          },
        });

        // Main line
        map.addLayer({
          id: `safr-route-line-${i}`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": color,
            "line-width": isSelected ? 6 : 3.5,
            "line-opacity": isSelected ? 1 : 0.35,
          },
        });

        // Direction arrows on selected route only
        if (isSelected) {
          map.addLayer({
            id: `safr-route-arrows-${i}`,
            type: "symbol",
            source: sourceId,
            layout: {
              "symbol-placement": "line",
              "icon-image": "safr-route-arrow",
              "icon-size": 0.7,
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "symbol-spacing": 80,
            },
          });
        }
      } catch (e) {
        console.error("Failed to add route layer", e);
      }
    });
  }, []);

  // -----------------------------------------------------------------------
  // MapLibre GL initialization
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;

    void import("maplibre-gl").then((ml) => {
      if (cancelled || !mapEl.current) return;
      maplibreRef.current = ml;
      injectMapCSS();

      const initStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;

      const map = new ml.Map({
        container: mapEl.current,
        style: initStyle.style,
        center: GOA_CENTER,
        zoom: 11,
        maxPitch: 70,
        minZoom: 8,
        maxBounds: GOA_BOUNDS,
        attributionControl: { compact: true },
        dragRotate: true,
      });

      mapRef.current = map;

      map.addControl(new ml.NavigationControl({ showCompass: true, showZoom: true }), "top-right");
      map.addControl(new ml.FullscreenControl(), "top-right");

      const geolocate = new ml.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      });
      geolocateRef.current = geolocate;
      map.addControl(geolocate, "top-right");

      // Style switcher (top-left)
      const switcherDiv = document.createElement("div");
      switcherDiv.className = "safr-style-switcher";
      MAP_STYLES.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "safr-style-btn";
        btn.textContent = s.icon;
        btn.title = s.label;
        btn.setAttribute("aria-label", `Map style: ${s.label}`);
        btn.setAttribute("aria-pressed", s.id === activeStyleId ? "true" : "false");
        btn.addEventListener("click", () => {
          setActiveStyleId(s.id);
        });
        switcherDiv.appendChild(btn);
      });

      class StyleSwitcherControl {
        _container?: HTMLElement;
        onAdd() {
          this._container = document.createElement("div");
          this._container.className = "maplibregl-ctrl";
          this._container.appendChild(switcherDiv);
          return this._container;
        }
        onRemove() { this._container?.remove(); }
      }
      map.addControl(new StyleSwitcherControl() as IControl, "top-left");

      // 3D toggle + reset view (top-left under switcher)
      const ctrlsDiv = document.createElement("div");
      ctrlsDiv.className = "maplibregl-ctrl";
      ctrlsDiv.style.cssText = "display:flex;flex-direction:column;gap:4px;";

      const btn3d = document.createElement("button");
      btn3d.className = "safr-map-ctrl-btn";
      btn3d.textContent = "3D";
      btn3d.setAttribute("aria-label", "Toggle 3D buildings and terrain");
      btn3d.setAttribute("aria-pressed", "false");
      btn3d.addEventListener("click", () => {
        setIs3d((prev) => !prev);
      });
      ctrlsDiv.appendChild(btn3d);

      const btnReset = document.createElement("button");
      btnReset.className = "safr-map-ctrl-btn";
      btnReset.textContent = "⌂";
      btnReset.setAttribute("aria-label", "Reset map view to Goa");
      btnReset.addEventListener("click", () => {
        const m = mapRef.current;
        if (!m) return;
        m.setMaxBounds(GOA_BOUNDS);
        m.flyTo({ center: GOA_CENTER, zoom: 11, pitch: 0, bearing: 0 });
      });
      ctrlsDiv.appendChild(btnReset);

      class ExtraControlsControl {
        _container?: HTMLElement;
        onAdd() {
          this._container = document.createElement("div");
          this._container.className = "maplibregl-ctrl";
          this._container.appendChild(ctrlsDiv);
          return this._container;
        }
        onRemove() { this._container?.remove(); }
      }
      map.addControl(new ExtraControlsControl() as IControl, "top-left");

      map.on("style.load", () => {
        const curStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;
        addCustomLayers(map, {
          is3d,
          isVector: curStyle.isVector,
          routeDataFn: addRouteDataToMap,
        });
      });

      map.on("load", () => {
        addCustomLayers(map, {
          is3d: false,
          isVector: initStyle.isVector,
          routeDataFn: addRouteDataToMap,
        });
        setReady(true);
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Style switching
  // -----------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const entry = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;
    map.setStyle(entry.style);

    // Update switcher button states
    const btns = map.getContainer().querySelectorAll<HTMLButtonElement>(".safr-style-btn");
    btns.forEach((btn, i) => {
      const s = MAP_STYLES[i];
      btn.setAttribute("aria-pressed", s?.id === activeStyleId ? "true" : "false");
    });

    // style.load handler re-adds custom layers
  }, [activeStyleId, ready]);

  // -----------------------------------------------------------------------
  // 3D toggle
  // -----------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const curStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;

    map.easeTo({ pitch: is3d ? 60 : 0, duration: 600 });

    addCustomLayers(map, {
      is3d,
      isVector: curStyle.isVector,
      routeDataFn: addRouteDataToMap,
    });

    // Update 3D button state
    const btn = map.getContainer().querySelector<HTMLButtonElement>(".safr-map-ctrl-btn");
    btn?.setAttribute("aria-pressed", is3d ? "true" : "false");
  }, [is3d, ready, activeStyleId, addRouteDataToMap]);

  // -----------------------------------------------------------------------
  // Location restore and geolocation
  // -----------------------------------------------------------------------

  useEffect(() => {
    let hasCached = false;
    try {
      const saved = localStorage.getItem("safr_last_origin");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed?.coords?.lat &&
          parsed?.coords?.lng &&
          Number.isFinite(parsed.coords.lat) &&
          Number.isFinite(parsed.coords.lng)
        ) {
          setOrigin(parsed.coords);
          if (parsed.label) setOriginLabel(parsed.label);
          if (parsed.isGps) setIsGpsOrigin(true);
          setLocationReady(true);
          hasCached = true;
        }
      }
    } catch {
      // localStorage failed
    }

    if (!hasCached) {
      setOriginLabel("Panjim (default starting point)");
    }

    requestUserLocation(true);
  }, []);

  useEffect(() => {
    if (searchParams.originLat && searchParams.originLng) {
      const lat = parseFloat(searchParams.originLat);
      const lng = parseFloat(searchParams.originLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setOrigin({ lat, lng });
        setOriginLabel(searchParams.origin || "Custom Starting Point");
        setIsGpsOrigin(false);
        setLocationReady(true);
      }
    }
  }, [searchParams.origin, searchParams.originLat, searchParams.originLng]);

  // -----------------------------------------------------------------------
  // Search and route mutations
  // -----------------------------------------------------------------------

  const searchMutation = useMutation({
    mutationFn: async (q: string) => (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setHits(data);
      if (data.length === 0) toast.info("No matching places found in Goa.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Search failed"),
  });

  const routeMutation = useMutation({
    mutationFn: async (dest: Hit) => {
      return (await route({
        data: {
          origin,
          destination: { lat: dest.lat, lng: dest.lng },
          isNight: isNightTime,
        },
      })) as Scored[];
    },
    onSuccess: (data, dest) => {
      setRoutes(data);
      setSelected(0);
      setDestination(dest);
      setHits([]);
      setActiveStepIndex(null);
      if (data.length === 0) toast.info("No driving route found.");
      else toast.success(`Driving routes calculated for ${dest.name}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not calculate routes"),
  });

  useEffect(() => {
    if (!ready || !locationReady || !searchParams.dest) return;
    const key = JSON.stringify([searchParams.dest, searchParams.lat, searchParams.lng]);
    if (requestedTarget.current === key) return;
    requestedTarget.current = key;
    if (searchParams.dest && !searchParams.lat && ready && locationReady)
      searchMutation.mutate(searchParams.dest);
    if (searchParams.dest && searchParams.lat && searchParams.lng && ready && locationReady) {
      const parsedLat = parseFloat(searchParams.lat);
      const parsedLng = parseFloat(searchParams.lng);
      if (
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180
      ) {
        const destHit: Hit = {
          id: "prefill",
          name: searchParams.dest,
          address: "Goa, India",
          lat: parsedLat,
          lng: parsedLng,
        };
        routeMutation.mutate(destHit);
      }
    }
  }, [
    searchParams.dest,
    searchParams.lat,
    searchParams.lng,
    ready,
    locationReady,
    routeMutation,
    searchMutation,
  ]);

  // -----------------------------------------------------------------------
  // Render routes, markers, and fit bounds
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!ml) return;

    // Remove old markers (DOM elements survive style change but we manage them here)
    originMarkerRef.current?.remove();
    destMarkerRef.current?.remove();
    stepMarkerRef.current?.remove();
    originMarkerRef.current = null;
    destMarkerRef.current = null;
    stepMarkerRef.current = null;

    // Origin marker
    const originEl = document.createElement("div");
    originEl.innerHTML = ORIGIN_MARKER_SVG;
    originEl.title = isGpsOrigin ? "You (Starting Point)" : "Starting Point";
    originMarkerRef.current = new ml.Marker({ element: originEl, anchor: "center" })
      .setLngLat([origin.lng, origin.lat])
      .setPopup(new ml.Popup({ offset: 16 }).setHTML(
        `<b>${isGpsOrigin ? "You (Starting Point)" : "Starting Point"}</b><br/>${originLabel}`
      ))
      .addTo(map);

    // Destination marker
    if (destination) {
      const destEl = document.createElement("div");
      destEl.innerHTML = DESTINATION_MARKER_SVG;
      destEl.title = destination.name;
      destMarkerRef.current = new ml.Marker({ element: destEl, anchor: "bottom" })
        .setLngLat([destination.lng, destination.lat])
        .setPopup(new ml.Popup({ offset: 24 }).setText(destination.name))
        .addTo(map);
    }

    // Remove old route layers/sources & re-add
    addRouteDataToMap();

    // Fit bounds
    if (routes.length === 0) {
      if (destination) {
        const bounds = new ml.LngLatBounds(
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        );
        // If route leaves Goa bounds, remove maxBounds restriction
        map.setMaxBounds(GOA_BOUNDS);
        map.fitBounds(bounds, { padding: 50 });
      } else {
        map.setMaxBounds(GOA_BOUNDS);
        map.flyTo({ center: [origin.lng, origin.lat], zoom: isGpsOrigin ? 14 : 12 });
      }
      return;
    }

    const bounds = new ml.LngLatBounds();
    bounds.extend([origin.lng, origin.lat]);
    if (destination) bounds.extend([destination.lng, destination.lat]);

    routes.forEach((r) => {
      if (!r.polyline) return;
      try {
        const pathCoords = JSON.parse(r.polyline) as [number, number][];
        pathCoords.forEach(([lat, lng]) => bounds.extend([lng, lat]));
      } catch { /* */ }
    });

    // If any route point lies outside Goa bounds, remove the restriction
    const goaSW = (GOA_BOUNDS as [[number, number], [number, number]])[0];
    const goaNE = (GOA_BOUNDS as [[number, number], [number, number]])[1];
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (
      sw.lng < goaSW[0] || sw.lat < goaSW[1] ||
      ne.lng > goaNE[0] || ne.lat > goaNE[1]
    ) {
      map.setMaxBounds(null);
    } else {
      map.setMaxBounds(GOA_BOUNDS);
    }

    map.fitBounds(bounds, { padding: 48 });

    // Animate draw-in for the selected route (respects prefers-reduced-motion)
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReducedMotion && routes[selected]?.polyline) {
      try {
        const selCoords = JSON.parse(routes[selected]!.polyline) as [number, number][];
        if (selCoords.length > 2) {
          const sourceId = `safr-route-${selected}`;
          const total = selCoords.length;
          const start = performance.now();
          const duration = 700;

          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const count = Math.max(2, Math.floor(progress * total));
            const partial = selCoords.slice(0, count);
            const coords = partial.map(([lat, lng]) => [lng, lat] as [number, number]);

            const src = map.getSource(sourceId);
            if (src && "setData" in src) {
              (src as { setData: (d: FeatureCollection) => void }).setData({
                type: "FeatureCollection",
                features: [{
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: coords },
                }],
              });
            }

            if (progress < 1) requestAnimationFrame(animate);
          };

          requestAnimationFrame(animate);
        }
      } catch { /* animation is optional, never break the map */ }
    }
  }, [routes, selected, ready, origin, destination, originLabel, isGpsOrigin, addRouteDataToMap]);

  // -----------------------------------------------------------------------
  // Step click handler
  // -----------------------------------------------------------------------

  const handleStepClick = (step: RouteStep, idx: number) => {
    setActiveStepIndex(idx);
    if (!mapRef.current || !step.location) return;
    const ml = maplibreRef.current;
    if (!ml) return;

    const [lat, lng] = step.location;
    mapRef.current.flyTo({ center: [lng, lat], zoom: 15 });

    stepMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.innerHTML = stepMarkerSvg(idx + 1);
    stepMarkerRef.current = new ml.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .setPopup(new ml.Popup({ offset: 16 }).setText(`Step ${idx + 1}: ${step.instruction}`))
      .addTo(mapRef.current);
    stepMarkerRef.current.togglePopup();
  };

  // -----------------------------------------------------------------------
  // Comparison cards logic (unchanged from previous implementation)
  // -----------------------------------------------------------------------

  const currentRoute = routes[selected];

  const fastestIdx = routes.findIndex((r) => r.isFastest);
  const shortestIdx = routes.findIndex((r) => r.isShortest);
  const safestIdx = routes.findIndex((r) => r.isSafest);

  type ComparisonCard = {
    title: string;
    index: number;
    detail: string;
    alsoSafest?: boolean;
  };

  const comparisonCards: ComparisonCard[] = [];
  if (routes.length > 0) {
    if (fastestIdx !== -1 && fastestIdx === shortestIdx) {
      const isSafestAlso = safestIdx !== -1 && safestIdx === fastestIdx;
      comparisonCards.push({
        title: "Fastest & shortest",
        index: fastestIdx,
        detail: "This route is both the quickest and the shortest among the returned options.",
        alsoSafest: isSafestAlso,
      });
      if (!isSafestAlso) {
        comparisonCards.push({
          title: "Safest route (estimate)",
          index: safestIdx,
          detail: "Based on mapped road conditions; not a safety guarantee",
        });
      }
    } else {
      const isFastestSafest = safestIdx !== -1 && safestIdx === fastestIdx;
      const isShortestSafest = safestIdx !== -1 && safestIdx === shortestIdx;

      if (fastestIdx !== -1) {
        comparisonCards.push({
          title: "Fastest route",
          index: fastestIdx,
          detail: "Lowest estimated time among returned routes",
          alsoSafest: isFastestSafest,
        });
      }
      if (shortestIdx !== -1) {
        comparisonCards.push({
          title: "Shortest available route",
          index: shortestIdx,
          detail: `Least road distance among ${routes.length} returned route${routes.length === 1 ? "" : "s"}; not a global shortest-path guarantee`,
          alsoSafest: isShortestSafest,
        });
      }
      if (!isFastestSafest && !isShortestSafest) {
        comparisonCards.push({
          title: "Safest route (estimate)",
          index: safestIdx,
          detail: "Based on mapped road conditions; not a safety guarantee",
        });
      }
    }
  }

  const gridColsClass =
    comparisonCards.length === 1
      ? "grid-cols-1"
      : comparisonCards.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-3";

  return (
    <AppShell title="Safe Route Workspace" subtitle="Driving directions" back>
      {/* Starting Location Control Panel */}
      <div className="mb-4 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-3.5 shadow-sm transition-all">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`size-2.5 rounded-full shrink-0 ${
                isGpsOrigin ? "bg-emerald-500 animate-pulse" : "bg-primary"
              }`}
            />
            <div className="text-xs truncate">
              <span className="text-muted-foreground">Starting from: </span>
              <strong className="text-foreground">{originLabel}</strong>
            </div>
            {isGpsOrigin && (
              <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold shrink-0">
                GPS Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant={isGpsOrigin ? "secondary" : "outline"}
              size="sm"
              onClick={() => requestUserLocation(false)}
              disabled={locating}
              className="h-8 gap-1.5 rounded-full text-xs font-semibold hover:border-primary/50"
            >
              {locating ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <LocateFixed className="size-3.5 text-primary" />
              )}
              <span>{locating ? "Locating…" : "Use My Location"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowOriginSearch(!showOriginSearch)}
              className="h-8 gap-1 rounded-full text-xs font-medium hover:border-primary/50"
            >
              <MapPin className="size-3 text-muted-foreground" />
              <span>{showOriginSearch ? "Cancel" : "Change Start"}</span>
            </Button>

            {!isGpsOrigin && origin.lat !== DEFAULT_ORIGIN.lat && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOrigin(DEFAULT_ORIGIN);
                  setOriginLabel("Panjim (default starting point)");
                  setIsGpsOrigin(false);
                  if (destination) {
                    routeMutation.mutate(destination);
                  }
                }}
                className="h-8 rounded-full text-xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Expandable Origin Search Input */}
        {showOriginSearch && (
          <div className="mt-3 pt-3 border-t border-border/40 animate-in fade-in slide-in-from-top-2 duration-200">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (originQuery.trim().length < 2) return;
                originSearchMutation.mutate(originQuery.trim());
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={originQuery}
                  placeholder="Search starting hotel, beach, station, or town in Goa…"
                  onChange={(e) => setOriginQuery(e.target.value)}
                  className="h-9 pl-9 pr-3 rounded-full text-xs bg-background/80"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={originSearchMutation.isPending}
                className="h-9 rounded-full px-4 text-xs font-semibold"
              >
                {originSearchMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </form>

            {/* Origin Hits Dropdown */}
            {originHits.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg z-20">
                {originHits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setOrigin({ lat: h.lat, lng: h.lng });
                      setOriginLabel(h.name);
                      setIsGpsOrigin(false);
                      setShowOriginSearch(false);
                      setOriginHits([]);
                      setOriginQuery("");
                      try {
                        localStorage.setItem(
                          "safr_last_origin",
                          JSON.stringify({
                            coords: { lat: h.lat, lng: h.lng },
                            label: h.name,
                            isGps: false,
                          }),
                        );
                      } catch {
                        // ignore
                      }
                      toast.success(`Starting point set to ${h.name}`);
                      if (destination) {
                        routeMutation.mutate(destination);
                      }
                    }}
                    className="block w-full border-b border-border/30 px-4 py-2.5 text-left last:border-0 hover:bg-primary/5 transition-colors"
                  >
                    <span className="block text-xs font-bold text-foreground">{h.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {h.address}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Route times exclude live traffic. Shortest means the least distance among the returned
        routes. Safety preference requires sufficient mapped road-condition evidence.
      </p>
      {/* Night Travel Safety Advisory Banner */}
      <div
        className={`mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold backdrop-blur-xl ${
          isNightTime
            ? "border-amber/30 bg-amber/10 text-amber"
            : "border-primary/20 bg-primary/5 text-primary"
        }`}
      >
        <div className="flex items-center gap-2">
          {isNightTime ? (
            <Moon className="size-4 shrink-0 animate-pulse" />
          ) : (
            <Sun className="size-4 shrink-0" />
          )}
          <span>
            {isNightTime
              ? "Night travel: confirm lighting and road conditions locally; these are not measured by the route service."
              : "Road routes use OpenStreetMap. Live traffic, crowd density and road safety conditions are unavailable."}
          </span>
        </div>
        <span className="rounded-full bg-card/80 px-2 py-0.5 text-[10px] font-bold">
          {isNightTime ? "Night Advisory" : "Live Routing"}
        </span>
      </div>

      {/* Destination Search Form */}
      <form
        className="flex gap-2.5 z-10 relative group"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length < 2) return;
          searchMutation.mutate(query.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            value={query}
            maxLength={120}
            placeholder="Search beach, fort, shack, or town in Goa…"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-4 rounded-full border-border/60 bg-card/80 backdrop-blur-xl text-base shadow-sm focus-visible:ring-primary focus-visible:border-primary transition-all"
          />
        </div>
        <Button
          type="submit"
          disabled={searchMutation.isPending}
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 shrink-0"
        >
          {searchMutation.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Navigation className="size-5" />
          )}
        </Button>
      </form>

      {/* Quick Destination Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-semibold mr-1">Popular:</span>
        {QUICK_DESTINATIONS.map((qd) => (
          <button
            key={qd.id}
            disabled={!locationReady || routeMutation.isPending}
            type="button"
            onClick={() => {
              setQuery(qd.name);
              routeMutation.mutate(qd);
            }}
            className="rounded-full bg-secondary/80 border border-border/50 px-3 py-1 text-xs font-semibold text-secondary-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary/40 transition-all"
          >
            {qd.name}
          </button>
        ))}
      </div>

      {/* Search Hits Autocomplete */}
      {hits.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-3xl border border-border/60 bg-card/95 backdrop-blur-2xl relative z-20 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          {hits.map((h) => (
            <button
              key={h.id}
              disabled={!locationReady || routeMutation.isPending}
              onClick={() => routeMutation.mutate(h)}
              className="block w-full border-b border-border/40 px-6 py-4 text-left last:border-0 hover:bg-primary/5 transition-colors focus:bg-primary/5 focus:outline-none"
            >
              <span className="block text-base font-bold text-foreground">{h.name}</span>
              <span className="block mt-0.5 text-xs text-muted-foreground">{h.address}</span>
            </button>
          ))}
        </div>
      )}

      {/* Interactive Map Container */}
      <div
        ref={mapEl}
        className="mt-6 h-80 sm:h-[420px] w-full overflow-hidden rounded-3xl border border-border/60 bg-secondary/40 shadow-inner z-0 relative transition-all"
      />

      {routeMutation.isPending && (
        <div className="mt-6 flex items-center justify-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-6 animate-pulse">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-sm font-bold text-primary">
            Comparing driving routes and checking mapped road conditions…
          </span>
        </div>
      )}

      {/* ROUTE COMPARISON CARDS */}
      {routes.length > 0 && currentRoute && (
        <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className={`grid gap-3 ${gridColsClass}`}>
            {comparisonCards.map((choice) => {
              const r = choice.index !== -1 ? routes[choice.index] : undefined;
              return (
                <button
                  key={choice.title}
                  disabled={!r}
                  aria-pressed={Boolean(r && choice.index === selected)}
                  onClick={() => {
                    if (r) {
                      setSelected(choice.index);
                      setActiveStepIndex(null);
                    }
                  }}
                  className={`rounded-3xl border p-5 text-left transition-all ${
                    r && choice.index === selected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border bg-card"
                  } ${!r ? "opacity-90 cursor-default" : "hover:border-primary/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold block text-foreground">{choice.title}</span>
                    {choice.alsoSafest && (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold shrink-0">
                        Also safest
                      </span>
                    )}
                  </div>
                  <span className="block mt-2 font-semibold">
                    {r ? `${r.durationMin} min · ${r.distanceKm} km` : "Cannot determine reliably"}
                  </span>
                  <span className="block mt-2 text-xs text-muted-foreground">
                    {r
                      ? choice.detail
                      : routes.length === 1
                        ? "Only one route returned; no safer alternative can be established."
                        : "Missing condition tags or no clear safety difference between routes."}
                  </span>
                </button>
              );
            })}
          </div>
          {routes.length === 1 && (
            <p className="text-sm text-muted-foreground">
              Fastest and shortest available refer to the same returned road route. No extra routes
              have been invented.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {routes.map((r, i) => (
              <Button
                key={i}
                variant={selected === i ? "default" : "outline"}
                onClick={() => {
                  setSelected(i);
                  setActiveStepIndex(null);
                }}
              >
                {r.label} · {r.distanceKm} km
              </Button>
            ))}
          </div>

          {/* Active Route Intelligence Card */}
          <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
              <div>
                <span className="rounded-full bg-primary/10 text-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Active Trajectory
                </span>
                <h3 className="text-xl font-bold font-display text-foreground mt-1 flex items-center gap-2">
                  <Milestone className="size-5 text-primary" />
                  {currentRoute.summary}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total Distance: <strong>{currentRoute.distanceKm} km</strong> · Travel Time:{" "}
                  <strong>{currentRoute.durationMin} mins</strong>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {currentRoute.googleMapsUrl && (
                  <a
                    href={currentRoute.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-coral via-orange-500 to-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md shadow-coral/20 transition-all hover:scale-105 active:scale-95"
                  >
                    <ExternalLink className="size-4" /> Start GPS Navigation
                  </a>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDirections(!showDirections)}
                  className="rounded-full font-bold text-xs gap-1.5"
                >
                  <ListOrdered className="size-3.5" />
                  {showDirections ? "Hide Directions" : "Turn-by-Turn"}
                </Button>
              </div>
            </div>

            {/* Safety Score Reasoning */}
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Route Characteristics (Estimated)
              </p>
              <ul className="mt-2 space-y-1.5">
                {currentRoute.reasons.map((reason, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs sm:text-sm text-foreground/90 leading-relaxed"
                  >
                    <span className="text-primary font-bold mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Step-by-Step Turn Directions Drawer */}
            {showDirections && currentRoute.steps && currentRoute.steps.length > 0 && (
              <div className="mt-6 border-t border-border/40 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <ListOrdered className="size-4" /> Turn-by-Turn Maneuvers (
                    {currentRoute.steps.length} steps)
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Tap any step to focus on map
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto pr-1 space-y-2 rounded-2xl border border-border/40 bg-secondary/30 p-2">
                  {currentRoute.steps.map((step, sIdx) => {
                    const isActive = activeStepIndex === sIdx;
                    return (
                      <div
                        key={sIdx}
                        onClick={() => handleStepClick(step, sIdx)}
                        className={`flex items-start gap-3 rounded-2xl p-3 cursor-pointer transition-all ${
                          isActive
                            ? "bg-primary/15 border border-primary/40 shadow-sm"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-card border border-border/60 shadow-xs mt-0.5">
                          {getManeuverIcon(step.maneuverType, step.maneuverModifier)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs sm:text-sm font-bold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}
                          >
                            {step.instruction}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDistance(step.distanceMeters)}
                            {step.durationSeconds > 0 &&
                              ` · ~${Math.ceil(step.durationSeconds / 60)} min`}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground/70 px-1.5 py-0.5 rounded bg-card border border-border/40">
                          #{sIdx + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

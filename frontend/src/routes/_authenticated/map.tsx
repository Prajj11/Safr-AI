import "maplibre-gl/dist/maplibre-gl.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Car,
  Bike,
  Footprints,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  Heart,
  ListOrdered,
  Loader2,
  LocateFixed,
  MapPin,
  Milestone,
  Moon,
  MoveUp,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Split,
  Sun,
  Trash2,
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
import { supabase } from "@/integrations/supabase/client";
import { getRoutes, searchPlaces, getRoutingConfig } from "@/lib/maps.functions";
import { getCurrentArea } from "@/lib/goa.functions";
import type { RouteStep, ScoredRoute, Waypoint } from "@/lib/maps.server";
import {
  MAP_STYLES,
  GOA_CENTER,
  GOA_BOUNDS,
  getDefaultStyleId,
  addCustomLayers,
  addArrowImage,
  ORIGIN_MARKER_SVG,
  DESTINATION_MARKER_SVG,
  stepMarkerSvg,
  injectMapCSS,
  OSM_RASTER_STYLE,
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
    stops?: string;
  } => {
    const params: {
      dest?: string;
      lat?: string;
      lng?: string;
      origin?: string;
      originLat?: string;
      originLng?: string;
      stops?: string;
    } = {};
    if (typeof search["dest"] === "string" && search["dest"]) params.dest = search["dest"];
    if (typeof search["lat"] === "string" && search["lat"]) params.lat = search["lat"];
    if (typeof search["lng"] === "string" && search["lng"]) params.lng = search["lng"];
    if (typeof search["origin"] === "string" && search["origin"]) params.origin = search["origin"];
    if (typeof search["originLat"] === "string" && search["originLat"])
      params.originLat = search["originLat"];
    if (typeof search["originLng"] === "string" && search["originLng"])
      params.originLng = search["originLng"];
    if (typeof search["stops"] === "string" && search["stops"]) {
      try {
        const parsed = JSON.parse(search["stops"]);
        if (Array.isArray(parsed)) params.stops = search["stops"];
      } catch {
        // ignore invalid JSON
      }
    }
    return params;
  },
  component: MapPage,
});

type Hit = { id: string; name: string; address: string; lat: number; lng: number };
type Scored = ScoredRoute;

const DEFAULT_ORIGIN = { lat: 15.4989, lng: 73.8278, name: "Panjim" };

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

function routeColor(kind: string, isSelected: boolean): string {
  if (!isSelected) return "#94a3b8";
  if (kind === "safer") return "#10b981";
  if (kind === "alt") return "#06b6d4";
  return "#f97316";
}

function getRecentSearches(): Hit[] {
  try {
    const raw = localStorage.getItem("safr_recent_destinations");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(hit: Hit): void {
  try {
    const recents = getRecentSearches().filter((r) => r.name.toLowerCase() !== hit.name.toLowerCase());
    recents.unshift(hit);
    localStorage.setItem("safr_recent_destinations", JSON.stringify(recents.slice(0, 5)));
  } catch {
    // ignore localStorage errors
  }
}

function isGoaNight(timeStr?: string): boolean {
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    if (typeof h === "number" && !isNaN(h)) {
      const minutes = h * 60 + (m || 0);
      return minutes < 390 || minutes >= 1125; // Before 06:30 or after 18:45
    }
  }
  const istFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = istFormatter.formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = h * 60 + m;
  return minutes < 390 || minutes >= 1125;
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
  const stopMarkersRef = useRef<MapLibreMarker[]>([]);
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
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [mapLoadError, setMapLoadError] = useState(false);

  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [query, setQuery] = useState(searchParams.dest || "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [routes, setRoutes] = useState<Scored[]>([]);
  const [selected, setSelected] = useState(0);
  const [destination, setDestination] = useState<Hit | null>(null);
  const [showDirections, setShowDirections] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  // Multi-stop waypoints (max 5)
  const [waypoints, setWaypoints] = useState<Hit[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [stopQuery, setStopQuery] = useState("");
  const [stopHits, setStopHits] = useState<Hit[]>([]);

  // Departure Time & Travel Mode
  const [departureMode, setDepartureMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("19:00");
  const [travelMode, setTravelMode] = useState<"car" | "motor_scooter" | "bicycle" | "walking">("car");

  // Saved places & Saved routes
  const [showSavedPlaces, setShowSavedPlaces] = useState(true);
  const [showSavedPicker, setShowSavedPicker] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);

  // Mobile Bottom Sheet expanded state
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Map style & 3D state
  const [activeStyleId, setActiveStyleId] = useState(getDefaultStyleId);
  const [is3d, setIs3d] = useState(false);

  const appliedStyleIdRef = useRef<string>(getDefaultStyleId());
  const activeStyleIdRef = useRef(activeStyleId);
  activeStyleIdRef.current = activeStyleId;
  const is3dRef = useRef(is3d);
  is3dRef.current = is3d;

  const isNightTime = departureMode === "now" ? isGoaNight() : isGoaNight(customTime);

  const search = useServerFn(searchPlaces);
  const route = useServerFn(getRoutes);
  const currentArea = useServerFn(getCurrentArea);
  const routingConfigFn = useServerFn(getRoutingConfig);

  // Routing config query (OSRM vs Valhalla)
  const { data: routingConfig } = useQuery({
    queryKey: ["routing-config"],
    queryFn: async () => await routingConfigFn(),
    staleTime: 60000,
  });

  // Saved places from Supabase
  const { data: savedPlaces = [] } = useQuery({
    queryKey: ["saved-places"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_places")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching saved places:", error);
        return [];
      }
      return data || [];
    },
  });

  // Saved routes from Supabase
  const { data: savedRoutesList = [], refetch: refetchSavedRoutes } = useQuery({
    queryKey: ["saved-routes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_routes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
  });

  const [recentDestinations, setRecentDestinations] = useState<Hit[]>([]);
  useEffect(() => {
    setRecentDestinations(getRecentSearches());
  }, []);

  const originSearchMutation = useMutation({
    mutationFn: async (q: string) => (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setOriginHits(data);
      if (data.length === 0) toast.info("No matching starting places found.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Origin search failed"),
  });

  const stopSearchMutation = useMutation({
    mutationFn: async (q: string) => (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setStopHits(data);
      if (data.length === 0) toast.info("No matching stops found.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Stop search failed"),
  });

  const requestUserLocation = (isAutomatic = false) => {
    if (!navigator.geolocation) {
      if (!isAutomatic) toast.error("Geolocation is not supported by your browser");
      setLocationReady(true);
      setOriginLabel("Panjim (default fallback)");
      return;
    }

    setLocating(true);

    const applyLocation = async (lat: number, lng: number) => {
      const coords = { lat, lng, name: "Your Location" };
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
        if (area?.name) label = `${area.name} (Your Location)`;
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
        // ignore
      }

      if (!isAutomatic) toast.success(`Starting point updated to ${label}`);
      if (destination) {
        calculateCurrentRoute(coords, destination, waypoints, travelMode);
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
          toast.error("Location permission was denied. Please allow location access in your browser settings.");
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
  // addRouteDataToMap & Saved Places Layer
  // -----------------------------------------------------------------------

  const routesRef = useRef(routes);
  const selectedRef = useRef(selected);
  const activeStepIndexRef = useRef(activeStepIndex);
  const savedPlacesRef = useRef(savedPlaces);
  const showSavedPlacesRef = useRef(showSavedPlaces);
  routesRef.current = routes;
  selectedRef.current = selected;
  activeStepIndexRef.current = activeStepIndex;
  savedPlacesRef.current = savedPlaces;
  showSavedPlacesRef.current = showSavedPlaces;

  const addRouteDataToMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const curRoutes = routesRef.current;
    const curSelected = selectedRef.current;
    const curStepIdx = activeStepIndexRef.current;

    // Clean up any existing route layers/sources
    for (let i = 0; i < 10; i++) {
      try { map.removeLayer(`safr-route-arrows-${i}`); } catch { /* */ }
      try { map.removeLayer(`safr-route-line-traveled-${i}`); } catch { /* */ }
      try { map.removeLayer(`safr-route-line-${i}`); } catch { /* */ }
      try { map.removeLayer(`safr-route-casing-${i}`); } catch { /* */ }
      try { map.removeSource(`safr-route-traveled-${i}`); } catch { /* */ }
      try { map.removeSource(`safr-route-${i}`); } catch { /* */ }
    }

    curRoutes.forEach((r, i) => {
      if (!r.polyline) return;
      try {
        const pathCoords = JSON.parse(r.polyline) as [number, number][];
        if (!pathCoords || pathCoords.length === 0) return;

        const coords = pathCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
        const isSelected = i === curSelected;
        const color = routeColor(r.kind, isSelected);

        // If stepping through route, split into traveled and remaining
        let remainingCoords = coords;
        let traveledCoords: [number, number][] = [];

        if (isSelected && curStepIdx !== null && r.steps[curStepIdx]?.location) {
          const stepLoc = r.steps[curStepIdx]!.location!;
          // Find closest coordinate index on polyline
          let closestIdx = 0;
          let minDist = Infinity;
          for (let cIdx = 0; cIdx < coords.length; cIdx++) {
            const d = Math.hypot(coords[cIdx]![0] - stepLoc[1], coords[cIdx]![1] - stepLoc[0]);
            if (d < minDist) {
              minDist = d;
              closestIdx = cIdx;
            }
          }
          if (closestIdx > 0) {
            traveledCoords = coords.slice(0, closestIdx + 1);
            remainingCoords = coords.slice(closestIdx);
          }
        }

        const sourceId = `safr-route-${i}`;
        const geojson: FeatureCollection = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: remainingCoords },
            },
          ],
        };
        map.addSource(sourceId, { type: "geojson", data: geojson });

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

        // Traveled progress line (muted color)
        if (traveledCoords.length >= 2) {
          const traveledSourceId = `safr-route-traveled-${i}`;
          map.addSource(traveledSourceId, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: traveledCoords },
                },
              ],
            },
          });
          map.addLayer({
            id: `safr-route-line-traveled-${i}`,
            type: "line",
            source: traveledSourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#64748b",
              "line-width": 5,
              "line-opacity": 0.7,
              "line-dasharray": [1.5, 1.5],
            },
          });
        }

        // Direction arrows on selected route
        if (isSelected) {
          addArrowImage(map);
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

    // Add or update Saved Places Clustered Layer
    try {
      if (map.getLayer("safr-saved-clusters")) map.removeLayer("safr-saved-clusters");
      if (map.getLayer("safr-saved-cluster-count")) map.removeLayer("safr-saved-cluster-count");
      if (map.getLayer("safr-saved-points")) map.removeLayer("safr-saved-points");
      if (map.getSource("safr-saved-places-src")) map.removeSource("safr-saved-places-src");

      if (showSavedPlacesRef.current && savedPlacesRef.current.length > 0) {
        const validPlaces = savedPlacesRef.current.filter((p) => p.lat && p.lng);
        const savedGeojson: FeatureCollection = {
          type: "FeatureCollection",
          features: validPlaces.map((p) => ({
            type: "Feature",
            properties: {
              id: p.id,
              name: p.place_name,
              category: p.category,
              notes: p.notes,
              status: p.status,
              lat: p.lat,
              lng: p.lng,
            },
            geometry: {
              type: "Point",
              coordinates: [p.lng!, p.lat!],
            },
          })),
        };

        map.addSource("safr-saved-places-src", {
          type: "geojson",
          data: savedGeojson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 40,
        });

        map.addLayer({
          id: "safr-saved-clusters",
          type: "circle",
          source: "safr-saved-places-src",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#14b8a6",
            "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 15, 28],
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "safr-saved-cluster-count",
          type: "symbol",
          source: "safr-saved-places-src",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });

        map.addLayer({
          id: "safr-saved-points",
          type: "circle",
          source: "safr-saved-places-src",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#0d9488",
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
    } catch (e) {
      console.error("Failed to render saved places layer:", e);
    }
  }, []);

  const routeDataFnRef = useRef(addRouteDataToMap);
  routeDataFnRef.current = addRouteDataToMap;

  const handleRetryMap = () => {
    setMapLoadError(false);
    setIsLoadingMap(true);
    const map = mapRef.current;
    if (map) {
      // Fallback to resilient OpenStreetMap raster style
      appliedStyleIdRef.current = "osm";
      setActiveStyleId("osm");
      map.setStyle(OSM_RASTER_STYLE);
    }
  };

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

      const initStyle = MAP_STYLES.find((s) => s.id === activeStyleIdRef.current) ?? MAP_STYLES[0]!;
      appliedStyleIdRef.current = initStyle.id;

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

      // Resilient fallback timer: only auto-fallbacks if style fails to initialize within 12 seconds
      const loadTimeout = setTimeout(() => {
        if (!map.isStyleLoaded()) {
          console.warn("[map] Style initialization timed out, falling back to OSM standard tiles...");
          try {
            appliedStyleIdRef.current = "osm";
            setActiveStyleId("osm");
            map.setStyle(OSM_RASTER_STYLE);
          } catch {
            setMapLoadError(true);
            setIsLoadingMap(false);
          }
        } else {
          setIsLoadingMap(false);
          setMapLoadError(false);
          setReady(true);
        }
      }, 12000);

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
        btn.setAttribute("aria-pressed", s.id === activeStyleIdRef.current ? "true" : "false");
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
      btnReset.setAttribute("aria-label", "Recenter map view");
      btnReset.addEventListener("click", () => {
        const m = mapRef.current;
        if (!m) return;
        if (routesRef.current.length > 0) {
          fitMapToRoute();
        } else {
          m.setMaxBounds(GOA_BOUNDS);
          m.flyTo({ center: GOA_CENTER, zoom: 11, pitch: 0, bearing: 0 });
        }
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

      // Error handler: log resource warnings, never blank screen for minor tile/glyph 404s
      map.on("error", (e) => {
        console.warn("[map resource]", e?.error?.message || e);
      });

      // Style load handler (single place where layers are restored)
      map.on("style.load", () => {
        clearTimeout(loadTimeout);
        setIsLoadingMap(false);
        setMapLoadError(false);
        setReady(true);

        const curStyle = MAP_STYLES.find((s) => s.id === activeStyleIdRef.current) ?? MAP_STYLES[0]!;
        addCustomLayers(map, {
          is3d: is3dRef.current,
          isVector: curStyle.isVector,
          routeDataFn: () => routeDataFnRef.current(),
        });
      });

      map.on("load", () => {
        clearTimeout(loadTimeout);
        setIsLoadingMap(false);
        setMapLoadError(false);
        setReady(true);
      });

      // Saved places point clicks -> open popup with actions
      map.on("click", "safr-saved-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const coordinates = (feature.geometry as any).coordinates.slice();
        const { id, name, category, lat, lng } = feature.properties as any;

        const popupDiv = document.createElement("div");
        popupDiv.className = "p-2 min-w-[180px]";

        const titleEl = document.createElement("div");
        titleEl.className = "font-bold text-sm text-foreground mb-1";
        titleEl.textContent = name;

        const catEl = document.createElement("div");
        catEl.className = "text-[11px] text-muted-foreground uppercase font-semibold mb-2";
        catEl.textContent = category || "Saved Place";

        const btnDest = document.createElement("button");
        btnDest.className = "block w-full text-left text-xs font-semibold py-1 px-2 mb-1 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors";
        btnDest.textContent = "📍 Set as destination";
        btnDest.addEventListener("click", () => {
          const hit: Hit = { id: id || "saved", name, address: category || "Goa", lat: Number(lat), lng: Number(lng) };
          setDestination(hit);
          setQuery(hit.name);
          saveRecentSearch(hit);
          setRecentDestinations(getRecentSearches());
          calculateCurrentRoute(origin, hit, waypoints, travelMode);
        });

        const btnStop = document.createElement("button");
        btnStop.className = "block w-full text-left text-xs font-semibold py-1 px-2 rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors";
        btnStop.textContent = "➕ Add as stop";
        btnStop.addEventListener("click", () => {
          if (waypoints.length >= 5) {
            toast.error("Maximum of 5 stops allowed.");
            return;
          }
          const stopHit: Hit = { id: id || `stop-${Date.now()}`, name, address: category || "Goa", lat: Number(lat), lng: Number(lng) };
          const updated = [...waypoints, stopHit];
          setWaypoints(updated);
          toast.success(`Added ${name} as stop`);
          if (destination) {
            calculateCurrentRoute(origin, destination, updated, travelMode);
          }
        });

        popupDiv.append(titleEl, catEl, btnDest, btnStop);

        new ml.Popup({ offset: 12 })
          .setLngLat(coordinates)
          .setDOMContent(popupDiv)
          .addTo(map);
      });

      // Cluster clicks -> zoom in
      map.on("click", "safr-saved-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["safr-saved-clusters"] });
        const clusterId = features[0]?.properties?.["cluster_id"];
        const source = map.getSource("safr-saved-places-src") as any;
        if (source && typeof source.getClusterExpansionZoom === "function") {
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            map.easeTo({
              center: (features[0]?.geometry as any).coordinates,
              zoom,
            });
          });
        }
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
  // Style switching & 3D effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (activeStyleId !== appliedStyleIdRef.current) {
      appliedStyleIdRef.current = activeStyleId;
      const entry = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;
      map.setStyle(entry.style);
    }

    const btns = map.getContainer().querySelectorAll<HTMLButtonElement>(".safr-style-btn");
    btns.forEach((btn, i) => {
      const s = MAP_STYLES[i];
      btn.setAttribute("aria-pressed", s?.id === activeStyleId ? "true" : "false");
    });
  }, [activeStyleId, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const curStyle = MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;
    map.easeTo({ pitch: is3d ? 60 : 0, duration: 600 });
    addCustomLayers(map, {
      is3d,
      isVector: curStyle.isVector,
      routeDataFn: () => routeDataFnRef.current(),
    });

    const btn = map.getContainer().querySelector<HTMLButtonElement>(".safr-map-ctrl-btn");
    btn?.setAttribute("aria-pressed", is3d ? "true" : "false");
  }, [is3d, ready, activeStyleId]);

  // -----------------------------------------------------------------------
  // Geolocation & URL params restore
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
      // ignore
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
        setOrigin({ lat, lng, name: searchParams.origin || "Custom Start" });
        setOriginLabel(searchParams.origin || "Custom Starting Point");
        setIsGpsOrigin(false);
        setLocationReady(true);
      }
    }
  }, [searchParams.origin, searchParams.originLat, searchParams.originLng]);

  // Handle URL stops param (JSON encoded)
  useEffect(() => {
    if (searchParams.stops) {
      try {
        const parsedStops = JSON.parse(searchParams.stops);
        if (Array.isArray(parsedStops)) {
          const validated = parsedStops
            .filter((s: any) => typeof s.lat === "number" && typeof s.lng === "number")
            .slice(0, 5)
            .map((s: any, idx: number) => ({
              id: `param-stop-${idx}`,
              name: s.name || `Stop ${idx + 1}`,
              address: "Goa, India",
              lat: s.lat,
              lng: s.lng,
            }));
          setWaypoints(validated);
        }
      } catch {
        // ignore
      }
    }
  }, [searchParams.stops]);

  // -----------------------------------------------------------------------
  // Route Calculation
  // -----------------------------------------------------------------------

  const routeMutation = useMutation({
    mutationFn: async (params: {
      origin: { lat: number; lng: number; name?: string };
      destination: Hit;
      waypoints: Hit[];
      mode: "car" | "motor_scooter" | "bicycle" | "walking";
    }) => {
      const wpPayload: Waypoint[] = params.waypoints.map((w) => ({
        lat: w.lat,
        lng: w.lng,
        name: w.name,
      }));
      return (await route({
        data: {
          origin: { lat: params.origin.lat, lng: params.origin.lng, name: originLabel },
          destination: { lat: params.destination.lat, lng: params.destination.lng, name: params.destination.name },
          waypoints: wpPayload,
          mode: params.mode,
          isNight: isNightTime,
        },
      })) as Scored[];
    },
    onSuccess: (data, variables) => {
      setRoutes(data);
      setSelected(0);
      setDestination(variables.destination);
      setHits([]);
      setActiveStepIndex(null);
      setSheetExpanded(true);
      if (data.length === 0) {
        toast.info("No route found for this configuration.");
      } else {
        toast.success(`Routes calculated for ${variables.destination.name}`);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not calculate routes"),
  });

  const calculateCurrentRoute = (
    orig = origin,
    dest = destination,
    wps = waypoints,
    m = travelMode,
  ) => {
    if (!dest) return;
    routeMutation.mutate({ origin: orig, destination: dest, waypoints: wps, mode: m });
  };

  const searchMutation = useMutation({
    mutationFn: async (q: string) => (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setHits(data);
      if (data.length === 0) toast.info("No matching places found in Goa.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Search failed"),
  });

  useEffect(() => {
    if (!ready || !locationReady || !searchParams.dest) return;
    const key = JSON.stringify([searchParams.dest, searchParams.lat, searchParams.lng, searchParams.stops]);
    if (requestedTarget.current === key) return;
    requestedTarget.current = key;

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
        setDestination(destHit);
        saveRecentSearch(destHit);
        setRecentDestinations(getRecentSearches());
        calculateCurrentRoute(origin, destHit, waypoints, travelMode);
      }
    } else if (searchParams.dest && !searchParams.lat && ready && locationReady) {
      searchMutation.mutate(searchParams.dest);
    }
  }, [
    searchParams.dest,
    searchParams.lat,
    searchParams.lng,
    searchParams.stops,
    ready,
    locationReady,
  ]);

  // -----------------------------------------------------------------------
  // Fit map to route + stops
  // -----------------------------------------------------------------------

  const fitMapToRoute = useCallback(() => {
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!map || !ml) return;

    const bounds = new ml.LngLatBounds();
    bounds.extend([origin.lng, origin.lat]);
    waypoints.forEach((w) => bounds.extend([w.lng, w.lat]));
    if (destination) bounds.extend([destination.lng, destination.lat]);

    routes.forEach((r) => {
      if (!r.polyline) return;
      try {
        const pathCoords = JSON.parse(r.polyline) as [number, number][];
        pathCoords.forEach(([lat, lng]) => bounds.extend([lng, lat]));
      } catch {
        // ignore
      }
    });

    const goaSW = (GOA_BOUNDS as [[number, number], [number, number]])[0]!;
    const goaNE = (GOA_BOUNDS as [[number, number], [number, number]])[1]!;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (
      sw.lng < goaSW[0] ||
      sw.lat < goaSW[1] ||
      ne.lng > goaNE[0] ||
      ne.lat > goaNE[1]
    ) {
      map.setMaxBounds(null);
    } else {
      map.setMaxBounds(GOA_BOUNDS);
    }

    map.fitBounds(bounds, { padding: 48 });
  }, [origin, waypoints, destination, routes]);

  // -----------------------------------------------------------------------
  // Render Markers on Map
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!ml) return;

    // Clear old markers
    originMarkerRef.current?.remove();
    destMarkerRef.current?.remove();
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    stepMarkerRef.current?.remove();
    originMarkerRef.current = null;
    destMarkerRef.current = null;
    stepMarkerRef.current = null;

    // 1. Origin marker
    const originEl = document.createElement("div");
    originEl.innerHTML = ORIGIN_MARKER_SVG;
    originEl.title = isGpsOrigin ? "You (Starting Point)" : "Starting Point";

    const originPopup = document.createElement("div");
    const oTitle = document.createElement("b");
    oTitle.textContent = isGpsOrigin ? "You (Starting Point)" : "Starting Point";
    const oSub = document.createElement("div");
    oSub.textContent = originLabel;
    originPopup.append(oTitle, oSub);

    originMarkerRef.current = new ml.Marker({ element: originEl, anchor: "center" })
      .setLngLat([origin.lng, origin.lat])
      .setPopup(new ml.Popup({ offset: 16 }).setDOMContent(originPopup))
      .addTo(map);

    // 2. Waypoints numbered markers
    waypoints.forEach((w, idx) => {
      const stopEl = document.createElement("div");
      stopEl.style.cssText =
        "background-color:#0284c7;color:white;width:28px;height:28px;border-radius:50%;border:2.5px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;";
      stopEl.textContent = String(idx + 1);

      const stopPopup = document.createElement("div");
      const sTitle = document.createElement("b");
      sTitle.textContent = `Stop ${idx + 1}: ${w.name}`;
      const sAddr = document.createElement("div");
      sAddr.textContent = w.address;
      stopPopup.append(sTitle, sAddr);

      const marker = new ml.Marker({ element: stopEl, anchor: "center" })
        .setLngLat([w.lng, w.lat])
        .setPopup(new ml.Popup({ offset: 16 }).setDOMContent(stopPopup))
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });

    // 3. Destination marker
    if (destination) {
      const destEl = document.createElement("div");
      destEl.innerHTML = DESTINATION_MARKER_SVG;
      destEl.title = destination.name;

      const destPopup = document.createElement("div");
      const dTitle = document.createElement("b");
      dTitle.textContent = destination.name;
      const dSub = document.createElement("div");
      dSub.textContent = destination.address;
      destPopup.append(dTitle, dSub);

      destMarkerRef.current = new ml.Marker({ element: destEl, anchor: "bottom" })
        .setLngLat([destination.lng, destination.lat])
        .setPopup(new ml.Popup({ offset: 24 }).setDOMContent(destPopup))
        .addTo(map);
    }

    addRouteDataToMap();

    if (destination || routes.length > 0) {
      fitMapToRoute();
    }
  }, [
    ready,
    origin,
    destination,
    waypoints,
    routes,
    selected,
    originLabel,
    isGpsOrigin,
    addRouteDataToMap,
    fitMapToRoute,
  ]);

  // Update active step marker on directions click
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

    const stepPopup = document.createElement("div");
    stepPopup.className = "text-xs font-semibold";
    stepPopup.textContent = `Step ${idx + 1}: ${step.instruction}`;

    stepMarkerRef.current = new ml.Marker({ element: el, anchor: "center" })
      .setLngLat([lng, lat])
      .setPopup(new ml.Popup({ offset: 16 }).setDOMContent(stepPopup))
      .addTo(mapRef.current);
    stepMarkerRef.current.togglePopup();
  };

  // -----------------------------------------------------------------------
  // Route Actions: Share, Save, Google Maps
  // -----------------------------------------------------------------------

  const handleShareRoute = () => {
    if (!destination) {
      toast.error("Set a destination first to share this trip.");
      return;
    }
    const params = new URLSearchParams();
    params.set("dest", destination.name);
    params.set("lat", String(destination.lat));
    params.set("lng", String(destination.lng));
    params.set("origin", originLabel);
    params.set("originLat", String(origin.lat));
    params.set("originLng", String(origin.lng));
    if (waypoints.length > 0) {
      params.set(
        "stops",
        JSON.stringify(
          waypoints.map((w) => ({ lat: w.lat, lng: w.lng, name: w.name })),
        ),
      );
    }
    const url = `${window.location.origin}/map?${params.toString()}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
      toast.success("Shareable route link copied to clipboard!");
    } else {
      toast.info(`Share link: ${url}`);
    }
  };

  const handleSaveRoute = async () => {
    if (!destination) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to save routes.");
        return;
      }

      const routeName = `${originLabel.split(" ")[0]} to ${destination.name}${waypoints.length > 0 ? ` (${waypoints.length} stops)` : ""}`;
      const { error } = await supabase.from("saved_routes").insert({
        user_id: user.id,
        name: routeName,
        mode: travelMode,
        origin: { lat: origin.lat, lng: origin.lng, name: originLabel },
        destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
        waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng, name: w.name })),
      });
      if (error) throw error;
      toast.success(`Route "${routeName}" saved to My Routes!`);
      refetchSavedRoutes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save route");
    }
  };

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
        detail: "This route is both the quickest and shortest option.",
        alsoSafest: isSafestAlso,
      });
      if (!isSafestAlso && safestIdx !== -1) {
        comparisonCards.push({
          title: "Safest route (estimate)",
          index: safestIdx,
          detail: "Based on mapped road conditions; not a guarantee",
        });
      }
    } else {
      const isFastestSafest = safestIdx !== -1 && safestIdx === fastestIdx;
      const isShortestSafest = safestIdx !== -1 && safestIdx === shortestIdx;

      if (fastestIdx !== -1) {
        comparisonCards.push({
          title: "Fastest route",
          index: fastestIdx,
          detail: "Lowest estimated travel time",
          alsoSafest: isFastestSafest,
        });
      }
      if (shortestIdx !== -1) {
        comparisonCards.push({
          title: "Shortest route",
          index: shortestIdx,
          detail: `Least road distance among ${routes.length} options`,
          alsoSafest: isShortestSafest,
        });
      }
      if (!isFastestSafest && !isShortestSafest && safestIdx !== -1) {
        comparisonCards.push({
          title: "Safest route (estimate)",
          index: safestIdx,
          detail: "Based on mapped road conditions; not a guarantee",
        });
      }
    }
  }

  return (
    <AppShell title="Safe Route Workspace" subtitle="Multi-stop route planning & road intelligence" back>
      {/* TWO-COLUMN LAYOUT ON DESKTOP, STACKED ON MOBILE */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* LEFT COLUMN: PLANNER & RESULTS (Scrolls Independently) */}
        <div className="flex flex-col gap-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto pr-1">
          {/* Starting Location Panel */}
          <div className="rounded-3xl border border-border/60 bg-card/85 backdrop-blur-xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`size-2.5 rounded-full shrink-0 ${
                    isGpsOrigin ? "bg-emerald-500 animate-pulse" : "bg-primary"
                  }`}
                />
                <div className="text-xs truncate">
                  <span className="text-muted-foreground">From: </span>
                  <strong className="text-foreground">{originLabel}</strong>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant={isGpsOrigin ? "secondary" : "outline"}
                  size="sm"
                  aria-label="Use Current GPS Location"
                  onClick={() => requestUserLocation(false)}
                  disabled={locating}
                  className="h-7 px-2.5 rounded-full text-xs font-semibold"
                >
                  {locating ? <Loader2 className="size-3 animate-spin" /> : <LocateFixed className="size-3 text-primary" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Change starting origin"
                  onClick={() => setShowOriginSearch(!showOriginSearch)}
                  className="h-7 px-2.5 rounded-full text-xs"
                >
                  <MapPin className="size-3 mr-1 text-muted-foreground" />
                  {showOriginSearch ? "Cancel" : "Change"}
                </Button>
              </div>
            </div>

            {showOriginSearch && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (originQuery.trim().length >= 2) originSearchMutation.mutate(originQuery.trim());
                  }}
                >
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={originQuery}
                      placeholder="Search origin in Goa…"
                      onChange={(e) => setOriginQuery(e.target.value)}
                      className="h-8 pl-8 pr-2 rounded-full text-xs bg-background/80"
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-8 rounded-full px-3 text-xs" disabled={originSearchMutation.isPending}>
                    {originSearchMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Search"}
                  </Button>
                </form>

                {originHits.length > 0 && (
                  <div className="mt-2 rounded-2xl border border-border/50 bg-card overflow-hidden shadow-md max-h-48 overflow-y-auto">
                    {originHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          setOrigin({ lat: h.lat, lng: h.lng, name: h.name });
                          setOriginLabel(h.name);
                          setIsGpsOrigin(false);
                          setShowOriginSearch(false);
                          setOriginHits([]);
                          setOriginQuery("");
                          calculateCurrentRoute({ lat: h.lat, lng: h.lng, name: h.name }, destination, waypoints, travelMode);
                        }}
                        className="block w-full border-b border-border/30 px-3 py-2 text-left last:border-0 hover:bg-muted text-xs"
                      >
                        <span className="font-bold block text-foreground">{h.name}</span>
                        <span className="text-[11px] text-muted-foreground truncate block">{h.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Intermediate Stops (Multi-Stop Trips) */}
          <div className="rounded-3xl border border-border/60 bg-card/85 backdrop-blur-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Milestone className="size-3.5 text-sky-500" /> Stops ({waypoints.length}/5)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Open saved places picker"
                  onClick={() => setShowSavedPicker(true)}
                  className="h-7 text-xs rounded-full gap-1 px-2.5 font-semibold"
                >
                  <Heart className="size-3 text-coral" /> From Bucket List
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Add stop"
                  disabled={waypoints.length >= 5}
                  onClick={() => setShowAddStop(!showAddStop)}
                  className="h-7 text-xs rounded-full gap-1 px-2.5 font-semibold"
                >
                  <Plus className="size-3" /> Add Stop
                </Button>
              </div>
            </div>

            {/* List of stops */}
            {waypoints.length > 0 ? (
              <div className="space-y-1.5 mt-2">
                {waypoints.map((wp, idx) => (
                  <div
                    key={wp.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-secondary/40 border border-border/40 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-5 rounded-full bg-sky-500 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-foreground truncate">{wp.name}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={idx === 0}
                        aria-label="Move stop up"
                        onClick={() => {
                          const copy = [...waypoints];
                          const temp = copy[idx - 1]!;
                          copy[idx - 1] = copy[idx]!;
                          copy[idx] = temp;
                          setWaypoints(copy);
                          calculateCurrentRoute(origin, destination, copy, travelMode);
                        }}
                        className="h-6 w-6 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={idx === waypoints.length - 1}
                        aria-label="Move stop down"
                        onClick={() => {
                          const copy = [...waypoints];
                          const temp = copy[idx + 1]!;
                          copy[idx + 1] = copy[idx]!;
                          copy[idx] = temp;
                          setWaypoints(copy);
                          calculateCurrentRoute(origin, destination, copy, travelMode);
                        }}
                        className="h-6 w-6 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove stop ${wp.name}`}
                        onClick={() => {
                          const updated = waypoints.filter((_, i) => i !== idx);
                          setWaypoints(updated);
                          calculateCurrentRoute(origin, destination, updated, travelMode);
                        }}
                        className="h-6 w-6 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Direct route with no intermediate stops.</p>
            )}

            {/* Add Stop Search Box */}
            {showAddStop && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (stopQuery.trim().length >= 2) stopSearchMutation.mutate(stopQuery.trim());
                  }}
                >
                  <Input
                    value={stopQuery}
                    placeholder="Search place to add as stop…"
                    onChange={(e) => setStopQuery(e.target.value)}
                    className="h-8 rounded-full text-xs bg-background/80"
                  />
                  <Button type="submit" size="sm" className="h-8 rounded-full px-3 text-xs" disabled={stopSearchMutation.isPending}>
                    {stopSearchMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Search"}
                  </Button>
                </form>

                {stopHits.length > 0 && (
                  <div className="mt-2 rounded-2xl border border-border/50 bg-card overflow-hidden shadow-md max-h-40 overflow-y-auto">
                    {stopHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          if (waypoints.length >= 5) {
                            toast.error("Maximum 5 stops reached.");
                            return;
                          }
                          const updated = [...waypoints, h];
                          setWaypoints(updated);
                          setShowAddStop(false);
                          setStopHits([]);
                          setStopQuery("");
                          toast.success(`Stop added: ${h.name}`);
                          calculateCurrentRoute(origin, destination, updated, travelMode);
                        }}
                        className="block w-full border-b border-border/30 px-3 py-2 text-left last:border-0 hover:bg-muted text-xs"
                      >
                        <span className="font-bold block text-foreground">{h.name}</span>
                        <span className="text-[11px] text-muted-foreground truncate block">{h.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Destination Search Form */}
          <div className="rounded-3xl border border-border/60 bg-card/85 backdrop-blur-xl p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
              Destination
            </span>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim().length >= 2) searchMutation.mutate(query.trim());
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={query}
                  maxLength={120}
                  placeholder="Beach, fort, church, or shack in Goa…"
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-full text-xs bg-background/80 shadow-inner"
                />
              </div>
              <Button
                type="submit"
                disabled={searchMutation.isPending}
                aria-label="Search destinations"
                className="h-11 w-11 rounded-full p-0 shrink-0"
              >
                {searchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
              </Button>
            </form>

            {/* Recent Searches Chips */}
            {recentDestinations.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-semibold">Recent:</span>
                {recentDestinations.map((rd) => (
                  <button
                    key={rd.id}
                    type="button"
                    onClick={() => {
                      setQuery(rd.name);
                      setDestination(rd);
                      calculateCurrentRoute(origin, rd, waypoints, travelMode);
                    }}
                    className="rounded-full bg-secondary/60 border border-border/40 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {rd.name}
                  </button>
                ))}
              </div>
            )}

            {/* Popular quick destinations */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold">Popular:</span>
              {QUICK_DESTINATIONS.map((qd) => (
                <button
                  key={qd.id}
                  type="button"
                  onClick={() => {
                    setQuery(qd.name);
                    setDestination(qd);
                    saveRecentSearch(qd);
                    setRecentDestinations(getRecentSearches());
                    calculateCurrentRoute(origin, qd, waypoints, travelMode);
                  }}
                  className="rounded-full bg-secondary/80 border border-border/50 px-2.5 py-0.5 text-[10px] font-semibold text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  {qd.name}
                </button>
              ))}
            </div>

            {/* Search Hits Autocomplete */}
            {hits.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl max-h-56 overflow-y-auto">
                {hits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setDestination(h);
                      setQuery(h.name);
                      saveRecentSearch(h);
                      setRecentDestinations(getRecentSearches());
                      calculateCurrentRoute(origin, h, waypoints, travelMode);
                    }}
                    className="block w-full border-b border-border/30 px-4 py-2.5 text-left last:border-0 hover:bg-primary/5 transition-colors"
                  >
                    <span className="block text-xs font-bold text-foreground">{h.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{h.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Departure Time & Travel Mode Selector */}
          <div className="rounded-3xl border border-border/60 bg-card/85 backdrop-blur-xl p-4 shadow-xs space-y-3">
            {/* Travel Mode */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                Travel Mode
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "car", label: "Car", icon: Car },
                  { id: "motor_scooter", label: "Scooter", icon: Bike },
                  { id: "bicycle", label: "Bicycle", icon: Zap },
                  { id: "walking", label: "Walking", icon: Footprints },
                ].map((modeItem) => {
                  const isSupported = routingConfig?.supportedModes
                    ? (routingConfig.supportedModes as readonly string[]).includes(modeItem.id)
                    : true;
                  const isSelected = travelMode === modeItem.id;
                  const Icon = modeItem.icon;

                  return (
                    <button
                      key={modeItem.id}
                      type="button"
                      disabled={!isSupported}
                      title={modeItem.label}
                      aria-label={`Travel mode: ${modeItem.label}`}
                      onClick={() => {
                        setTravelMode(modeItem.id as any);
                        if (destination) {
                          calculateCurrentRoute(origin, destination, waypoints, modeItem.id as any);
                        }
                      }}
                      className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-primary/15 border-primary text-primary shadow-xs"
                          : "bg-secondary/40 border-border/50 text-foreground hover:bg-secondary/70"
                      }`}
                    >
                      <Icon className="size-4 mb-1" />
                      <span className="text-[10px]">{modeItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Departure Time */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" /> Departure Time
                </span>
                <div className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-full border border-border/40">
                  <button
                    type="button"
                    onClick={() => {
                      setDepartureMode("now");
                      if (destination) calculateCurrentRoute(origin, destination, waypoints, travelMode);
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      departureMode === "now" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Leave Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDepartureMode("custom");
                      if (destination) calculateCurrentRoute(origin, destination, waypoints, travelMode);
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      departureMode === "custom" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Leave At
                  </button>
                </div>
              </div>

              {departureMode === "custom" && (
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    type="time"
                    value={customTime}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      if (destination) calculateCurrentRoute(origin, destination, waypoints, travelMode);
                    }}
                    className="h-8 rounded-xl text-xs bg-background/80"
                  />
                  <span className="text-[11px] text-muted-foreground">Local IST</span>
                </div>
              )}

              {isNightTime && (
                <div className="flex items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <Moon className="size-3.5 shrink-0" />
                  <span>Night driving: lighting data matters more</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions (Saved Routes & Saved Places Marker Toggle) */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setShowSavedPlaces((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold"
            >
              <Heart className={`size-3.5 ${showSavedPlaces ? "text-coral fill-coral/30" : ""}`} />
              <span>{showSavedPlaces ? "Hide saved places on map" : "Show saved places on map"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSavedRoutes(!showSavedRoutes)}
              className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
            >
              <Bookmark className="size-3.5" />
              <span>My Routes ({savedRoutesList.length})</span>
            </button>
          </div>

          {/* My Routes Popover/Dropdown */}
          {showSavedRoutes && (
            <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-lg animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Saved Trips</h4>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowSavedRoutes(false)}>
                  <X className="size-3.5" />
                </Button>
              </div>
              {savedRoutesList.length === 0 ? (
                <p className="text-xs text-muted-foreground">No saved routes yet. Plan a trip and click "Save Route".</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {savedRoutesList.map((sr: any) => (
                    <div
                      key={sr.id}
                      className="p-2.5 rounded-2xl border border-border/40 bg-secondary/30 hover:bg-secondary/60 transition-colors flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (sr.destination) {
                            const d = sr.destination;
                            setDestination({ id: "saved", name: d.name, address: d.name, lat: d.lat, lng: d.lng });
                            setQuery(d.name);
                          }
                          if (sr.origin?.lat && sr.origin?.lng) {
                            setOrigin(sr.origin);
                            setOriginLabel(sr.origin.name || "Saved Start");
                          }
                          if (Array.isArray(sr.waypoints)) {
                            setWaypoints(
                              sr.waypoints.map((w: any, idx: number) => ({
                                id: `swp-${idx}`,
                                name: w.name,
                                address: "Goa, India",
                                lat: w.lat,
                                lng: w.lng,
                              })),
                            );
                          }
                          if (sr.mode) setTravelMode(sr.mode);
                          setShowSavedRoutes(false);
                          toast.success(`Loaded route: ${sr.name}`);
                          calculateCurrentRoute(sr.origin, sr.destination, sr.waypoints || [], sr.mode || "car");
                        }}
                        className="text-left text-xs font-bold text-foreground truncate min-w-0"
                      >
                        {sr.name}
                      </button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Delete saved route"
                        onClick={async () => {
                          await supabase.from("saved_routes").delete().eq("id", sr.id);
                          refetchSavedRoutes();
                          toast.success("Saved route removed");
                        }}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ROUTE COMPARISON CARDS & DIRECTIONS (Left column on desktop) */}
          {routeMutation.isPending && (
            <div className="flex items-center justify-center gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-4 animate-pulse">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-xs font-bold text-primary">Calculating optimal routes…</span>
            </div>
          )}

          {routes.length > 0 && currentRoute && (
            <div className="space-y-4">
              {/* Comparison Cards */}
              <div className="grid gap-2">
                {comparisonCards.map((choice) => {
                  const r = choice.index !== -1 ? routes[choice.index] : undefined;
                  const isCur = r && choice.index === selected;
                  return (
                    <button
                      key={choice.title}
                      type="button"
                      disabled={!r}
                      onClick={() => {
                        if (r) {
                          setSelected(choice.index);
                          setActiveStepIndex(null);
                        }
                      }}
                      className={`rounded-2xl border p-3.5 text-left transition-all ${
                        isCur
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                          : "border-border/60 bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-foreground">{choice.title}</span>
                        {choice.alsoSafest && (
                          <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
                            Also safest
                          </span>
                        )}
                      </div>
                      <span className="block mt-1 font-bold text-sm text-foreground">
                        {r ? `${r.durationMin} min · ${r.distanceKm} km` : "Unavailable"}
                      </span>
                      <span className="block mt-0.5 text-[11px] text-muted-foreground">{choice.detail}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Route Details Card */}
              <div className="rounded-3xl border border-border/60 bg-card/90 backdrop-blur-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                      <Milestone className="size-4 text-primary" /> {currentRoute.summary}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      <strong>{currentRoute.distanceKm} km</strong> · ~<strong>{currentRoute.durationMin} mins</strong>
                    </p>
                  </div>

                  {/* Actions: Share, Save, Google Maps */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Share route link"
                      onClick={handleShareRoute}
                      className="h-8 w-8 p-0 rounded-full"
                    >
                      <Share2 className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Save route"
                      onClick={handleSaveRoute}
                      className="h-8 w-8 p-0 rounded-full"
                    >
                      <Bookmark className="size-3.5 text-primary" />
                    </Button>
                    {currentRoute.googleMapsUrl && (
                      <a
                        href={currentRoute.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Google Maps"
                        className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold gap-1 shadow-xs hover:scale-102 transition-transform"
                      >
                        <ExternalLink className="size-3" /> GMaps
                      </a>
                    )}
                  </div>
                </div>

                {/* Per-leg summary if multi-stop */}
                {currentRoute.legs && currentRoute.legs.length > 1 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Legs Breakdown
                    </span>
                    {currentRoute.legs.map((leg) => (
                      <div
                        key={leg.legIndex}
                        className="flex items-center justify-between p-2 rounded-xl bg-secondary/30 text-xs border border-border/30"
                      >
                        <span className="font-semibold text-foreground truncate max-w-[200px]">
                          {leg.fromName} → {leg.toName}
                        </span>
                        <span className="font-mono text-muted-foreground shrink-0">
                          {formatDistance(leg.distanceMeters)} · ~{Math.ceil(leg.durationSeconds / 60)}m
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Safety Reasons */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Safety & Road Characteristics
                  </span>
                  <ul className="space-y-1 text-xs text-foreground/90">
                    {currentRoute.reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 leading-snug">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Turn-by-turn maneuvers */}
                <div className="border-t border-border/40 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                      <ListOrdered className="size-3.5" /> Maneuvers ({currentRoute.steps.length})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setShowDirections(!showDirections)}
                    >
                      {showDirections ? "Hide" : "Show"}
                    </Button>
                  </div>

                  {showDirections && (
                    <div className="max-h-60 overflow-y-auto pr-1 space-y-1 rounded-2xl border border-border/40 bg-secondary/20 p-2">
                      {currentRoute.steps.map((step, sIdx) => {
                        const isActive = activeStepIndex === sIdx;
                        return (
                          <div
                            key={sIdx}
                            onClick={() => handleStepClick(step, sIdx)}
                            className={`flex items-start gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${
                              isActive
                                ? "bg-primary/20 border border-primary/40 shadow-xs"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-card border border-border/60 mt-0.5">
                              {getManeuverIcon(step.maneuverType, step.maneuverModifier)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-xs font-bold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>
                                {step.instruction}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatDistance(step.distanceMeters)}
                                {step.durationSeconds > 0 && ` · ~${Math.ceil(step.durationSeconds / 60)}m`}
                              </p>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-muted-foreground px-1 py-0.5 rounded bg-card border border-border/40">
                              #{sIdx + 1}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: STICKY FULL-HEIGHT MAP */}
        <div className="relative w-full h-[55vh] min-h-[360px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-24 rounded-3xl border border-border/60 bg-secondary/40 shadow-inner overflow-hidden z-0">
          <div ref={mapEl} className="h-full w-full" />

          {/* Loading Shimmer Overlay */}
          {isLoadingMap && !mapLoadError && (
            <div className="absolute inset-0 pointer-events-none bg-muted/30 backdrop-blur-[2px] animate-pulse flex items-center justify-center z-10">
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" /> Loading map tiles…
              </span>
            </div>
          )}

          {/* Map Load Error Fallback Overlay */}
          {mapLoadError && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
              <p className="text-sm font-semibold text-foreground mb-3">Map tiles could not be loaded.</p>
              <Button size="sm" variant="outline" onClick={handleRetryMap} className="gap-2 rounded-xl text-xs font-bold">
                <RotateCcw className="size-3.5" /> Retry
              </Button>
            </div>
          )}

          {/* MOBILE BOTTOM SHEET FOR ROUTE SUMMARY (Collapsed by default, tap/drag to expand) */}
          <div className="lg:hidden absolute bottom-3 left-3 right-3 z-10 pointer-events-auto">
            {routes.length > 0 && currentRoute && (
              <div className="rounded-2xl border border-border/70 bg-card/95 backdrop-blur-2xl shadow-xl overflow-hidden transition-all duration-300">
                <button
                  type="button"
                  onClick={() => setSheetExpanded(!sheetExpanded)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-xs text-foreground block truncate">
                      {currentRoute.summary}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {currentRoute.durationMin} min · {currentRoute.distanceKm} km · {currentRoute.label}
                    </span>
                  </div>
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {sheetExpanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                  </div>
                </button>

                {sheetExpanded && (
                  <div className="p-3 pt-0 border-t border-border/40 max-h-56 overflow-y-auto space-y-2 mt-1">
                    <div className="flex items-center gap-2 pt-2">
                      {currentRoute.googleMapsUrl && (
                        <a
                          href={currentRoute.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-center py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs"
                        >
                          GPS Navigation
                        </a>
                      )}
                      <Button size="sm" variant="outline" onClick={handleShareRoute} className="h-8 rounded-xl px-3 text-xs">
                        <Share2 className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSaveRoute} className="h-8 rounded-xl px-3 text-xs">
                        <Bookmark className="size-3.5" />
                      </Button>
                    </div>

                    {currentRoute.legs && currentRoute.legs.length > 1 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase text-muted-foreground">Legs</span>
                        {currentRoute.legs.map((leg) => (
                          <div key={leg.legIndex} className="text-[11px] text-foreground flex justify-between">
                            <span className="truncate max-w-[180px]">{leg.fromName} → {leg.toName}</span>
                            <span className="font-mono text-muted-foreground">{formatDistance(leg.distanceMeters)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* POPUP MODAL: PICK FROM SAVED PLACES (BUCKET LIST) */}
      {showSavedPicker && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Heart className="size-4 text-coral" /> Bucket List Places
              </h3>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" onClick={() => setShowSavedPicker(false)}>
                <X className="size-4" />
              </Button>
            </div>

            {savedPlaces.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Your bucket list is empty. Explore places in Goa and tap the heart icon to save them!
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {savedPlaces.map((sp) => (
                  <div
                    key={sp.id}
                    className="p-3 rounded-2xl border border-border/40 bg-secondary/30 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-foreground truncate">{sp.place_name}</h4>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{sp.category}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (waypoints.length >= 5) {
                            toast.error("Maximum 5 stops reached.");
                            return;
                          }
                          const stopHit: Hit = {
                            id: sp.id,
                            name: sp.place_name,
                            address: sp.category || "Goa",
                            lat: sp.lat || DEFAULT_ORIGIN.lat,
                            lng: sp.lng || DEFAULT_ORIGIN.lng,
                          };
                          const updated = [...waypoints, stopHit];
                          setWaypoints(updated);
                          setShowSavedPicker(false);
                          toast.success(`Added ${sp.place_name} as stop`);
                          calculateCurrentRoute(origin, destination, updated, travelMode);
                        }}
                        className="h-7 text-[10px] px-2.5 rounded-full font-bold"
                      >
                        + Stop
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const hit: Hit = {
                            id: sp.id,
                            name: sp.place_name,
                            address: sp.category || "Goa",
                            lat: sp.lat || DEFAULT_ORIGIN.lat,
                            lng: sp.lng || DEFAULT_ORIGIN.lng,
                          };
                          setDestination(hit);
                          setQuery(hit.name);
                          setShowSavedPicker(false);
                          saveRecentSearch(hit);
                          setRecentDestinations(getRecentSearches());
                          toast.success(`Set destination to ${sp.place_name}`);
                          calculateCurrentRoute(origin, hit, waypoints, travelMode);
                        }}
                        className="h-7 text-[10px] px-2.5 rounded-full font-bold"
                      >
                        Dest
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

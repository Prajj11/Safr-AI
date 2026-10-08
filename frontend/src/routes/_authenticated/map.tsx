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
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  IControl,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import "@/features/map/components/user-location.css";
import { useUserLocation } from "@/features/map/hooks/useUserLocation";
import { RecenterButton } from "@/features/map/components/RecenterButton";
import { usePlacePicker } from "@/features/map/hooks/usePlacePicker";
import { PlaceCard } from "@/features/map/components/PlaceCard";
import type { PickedPlace } from "@/features/map/lib/place-picking";
import { useMapInstance } from "@/features/map/hooks/useMapInstance";
import { useMapStyle } from "@/features/map/hooks/useMapStyle";
import { useOrigin } from "@/features/map/hooks/useOrigin";
import { useRouteLayers } from "@/features/map/hooks/useRouteLayers";
import { useSavedPlaces } from "@/features/map/hooks/useSavedPlaces";
import { useRoutePlanner } from "@/features/map/hooks/useRoutePlanner";
import { useLatest } from "@/features/map/hooks/useLatest";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  getRoutes,
  searchPlaces,
  getRoutingConfig,
} from "@/lib/maps.functions";
import { getCurrentArea } from "@/lib/goa.functions";
import type { RouteStep, ScoredRoute, Waypoint } from "@/lib/maps.server";
import {
  MAP_STYLES,
  GOA_CENTER,
  GOA_BOUNDS,
  getDefaultStyleId,
  addCustomLayers,
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
    if (typeof search["dest"] === "string" && search["dest"])
      params.dest = search["dest"];
    if (typeof search["lat"] === "string" && search["lat"])
      params.lat = search["lat"];
    if (typeof search["lng"] === "string" && search["lng"])
      params.lng = search["lng"];
    if (typeof search["origin"] === "string" && search["origin"])
      params.origin = search["origin"];
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

import type { Hit, Scored, TravelMode } from "@/features/map/lib/types";
import {
  DEFAULT_ORIGIN,
  QUICK_DESTINATIONS,
} from "@/features/map/lib/constants";
import { formatDistance, routeColor } from "@/features/map/lib/format";
import {
  getRecentSearches,
  saveRecentSearch,
} from "@/features/map/lib/recent-searches";
import { isGoaNight } from "@/features/map/lib/goa-time";
import { getManeuverIcon } from "@/features/map/lib/maneuver-icon";

// ---------------------------------------------------------------------------
// MapPage component
// ---------------------------------------------------------------------------

function MapPage() {
  const searchParams = Route.useSearch();
  const requestedTarget = useRef("");
  const mapEl = useRef<HTMLDivElement>(null);

  const fitMapToRouteFnRef = useRef<() => void>(() => {});
  const routeDataFnRef = useRef<() => void>(() => {});

  const [query, setQuery] = useState(searchParams.dest || "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [destination, setDestination] = useState<Hit | null>(null);

  // Departure Time & Travel Mode
  const [departureMode, setDepartureMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("19:00");
  const [travelMode, setTravelMode] = useState<
    "car" | "motor_scooter" | "bicycle" | "walking"
  >("car");

  // Mobile Bottom Sheet expanded state
  const [sheetExpanded, setSheetExpanded] = useState(false);

  // Map style & 3D state
  const [activeStyleId, setActiveStyleId] = useState(getDefaultStyleId);
  const [is3d, setIs3d] = useState(false);

  // Fresh state ref for map popups and place card actions (prevents stale closure)
  const latestMapStateRef = useRef<{
    origin: { lat: number; lng: number; name: string };
    destination: Hit | null;
    waypoints: Hit[];
    travelMode: TravelMode;
    calculateCurrentRoute: (
      orig?: { lat: number; lng: number; name: string },
      dest?: Hit | null,
      wps?: Hit[],
      m?: TravelMode,
    ) => void;
  }>(null!);

  const handleResetView = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    if (latestMapStateRef.current?.destination) {
      fitMapToRouteFnRef.current();
    } else {
      m.setMaxBounds(GOA_BOUNDS);
      m.flyTo({ center: GOA_CENTER, zoom: 11, pitch: 0, bearing: 0 });
    }
  }, []);

  const {
    mapRef,
    maplibreRef,
    ready,
    isLoadingMap,
    mapLoadError,
    appliedStyleIdRef,
    retry: handleRetryMap,
  } = useMapInstance({
    containerRef: mapEl,
    activeStyleId,
    is3d,
    onStyleChange: setActiveStyleId,
    onToggle3d: () => setIs3d((prev) => !prev),
    onResetView: handleResetView,
    routeDataFn: () => routeDataFnRef.current(),
  });

  useMapStyle({
    map: ready ? mapRef.current : null,
    ready,
    activeStyleId,
    is3d,
    appliedStyleIdRef,
    routeDataFn: () => routeDataFnRef.current(),
  });

  const userLocation = useUserLocation({
    mapRef,
    ready,
    maplibreRef,
  });

  const isNightTime =
    departureMode === "now" ? isGoaNight() : isGoaNight(customTime);

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
  const [recentDestinations, setRecentDestinations] = useState<Hit[]>([]);
  useEffect(() => {
    setRecentDestinations(getRecentSearches());
  }, []);

  const {
    origin,
    setOrigin,
    originLabel,
    setOriginLabel,
    locationReady,
    isGpsOrigin,
    setIsGpsOrigin,
    locating,
    showOriginSearch,
    setShowOriginSearch,
    originQuery,
    setOriginQuery,
    originHits,
    setOriginHits,
    originSearchMutation,
    requestUserLocation,
  } = useOrigin({
    map: ready ? mapRef.current : null,
    currentAreaFn: currentArea,
    searchPlacesFn: search,
    initialOrigin: {
      name: searchParams.origin,
      lat: searchParams.originLat,
      lng: searchParams.originLng,
    },
    onStartTracking: () => userLocation.start(),
    onLocationApplied: (coords) => {
      const state = latestMapStateRef.current;
      if (state?.destination) {
        state.calculateCurrentRoute(
          coords,
          state.destination,
          state.waypoints,
          state.travelMode,
        );
      }
    },
  });

  const {
    savedPlaces,
    savedRoutesList,
    refetchSavedRoutes,
    showSavedPlaces,
    setShowSavedPlaces,
    showSavedPicker,
    setShowSavedPicker,
    showSavedRoutes,
    setShowSavedRoutes,
    syncSavedPlacesLayer,
  } = useSavedPlaces({
    map: ready ? mapRef.current : null,
    maplibre: ready ? maplibreRef.current : null,
    ready,
    onSetDestination: (hit) => {
      setDestination(hit);
      setQuery(hit.name);
      saveRecentSearch(hit);
      setRecentDestinations(getRecentSearches());
      const state = latestMapStateRef.current;
      state.calculateCurrentRoute(
        state.origin,
        hit,
        state.waypoints,
        state.travelMode,
      );
    },
    onAddStop: (hit) => {
      const state = latestMapStateRef.current;
      if (state.waypoints.length >= 5) {
        toast.error("Maximum of 5 stops allowed.");
        return;
      }
      const updated = [...state.waypoints, hit];
      setWaypoints(updated);
      toast.success(`Added ${hit.name} as stop`);
      if (state.destination) {
        state.calculateCurrentRoute(
          state.origin,
          state.destination,
          updated,
          state.travelMode,
        );
      }
    },
  });

  const {
    routes,
    setRoutes,
    selected,
    setSelected,
    activeStepIndex,
    setActiveStepIndex,
    waypoints,
    setWaypoints,
    showAddStop,
    setShowAddStop,
    stopQuery,
    setStopQuery,
    stopHits,
    setStopHits,
    showDirections,
    setShowDirections,
    stopSearchMutation,
    routeMutation,
    calculateCurrentRoute,
    fitMapToRoute,
    handleStepClick,
    handleShareRoute,
    handleSaveRoute,
    currentRoute,
    comparisonCards,
  } = useRoutePlanner({
    map: ready ? mapRef.current : null,
    maplibre: ready ? maplibreRef.current : null,
    origin,
    originLabel,
    destination,
    setDestination,
    travelMode,
    isNightTime,
    initialStops: searchParams.stops,
    routeFn: route,
    searchPlacesFn: search,
    refetchSavedRoutes,
    updateStepMarker: (step, idx) => updateStepMarker(step, idx),
    onClearHits: () => setHits([]),
    onOpenSheet: () => setSheetExpanded(true),
  });

  fitMapToRouteFnRef.current = fitMapToRoute;

  const { addRouteDataToMap, updateStepMarker } = useRouteLayers({
    map: ready ? mapRef.current : null,
    maplibre: ready ? maplibreRef.current : null,
    ready,
    origin,
    originLabel,
    isGpsOrigin,
    destination,
    waypoints,
    routes,
    selected,
    activeStepIndex,
    onFitBounds: fitMapToRoute,
  });

  routeDataFnRef.current = () => {
    addRouteDataToMap();
    syncSavedPlacesLayer();
  };

  latestMapStateRef.current = {
    origin,
    destination,
    waypoints,
    travelMode,
    calculateCurrentRoute,
  };

  // -----------------------------------------------------------------------
  // Place picking & PlaceCard logic
  // -----------------------------------------------------------------------
  const isCurrentVector =
    MAP_STYLES.find((s) => s.id === activeStyleId)?.isVector ?? true;

  const routeSheetWasExpandedRef = useRef(false);

  const handlePlacePick = useCallback((_place: PickedPlace) => {
    setSheetExpanded((prev) => {
      if (prev) {
        routeSheetWasExpandedRef.current = true;
        return false;
      }
      return prev;
    });
  }, []);

  const handlePlaceDismiss = useCallback(() => {
    if (routeSheetWasExpandedRef.current) {
      setSheetExpanded(true);
      routeSheetWasExpandedRef.current = false;
    }
  }, []);

  const { pickedPlace, clearPickedPlace, showRasterChip, dismissRasterChip } =
    usePlacePicker({
      map: ready ? mapRef.current : null,
      maplibre: ready ? maplibreRef.current : null,
      isVector: isCurrentVector,
      onPlacePick: handlePlacePick,
      onDismiss: handlePlaceDismiss,
    });

  const handlePlaceClose = () => {
    clearPickedPlace();
    if (routeSheetWasExpandedRef.current) {
      setSheetExpanded(true);
      routeSheetWasExpandedRef.current = false;
    }
  };

  const handlePlaceDirections = (place: PickedPlace) => {
    const hit: Hit = {
      id: place.id,
      name: place.name,
      address: place.kindLabel,
      lat: place.lat,
      lng: place.lng,
    };
    setDestination(hit);
    setQuery(hit.name);
    saveRecentSearch(hit);
    setRecentDestinations(getRecentSearches());
    const {
      origin: currOrigin,
      waypoints: currWaypoints,
      travelMode: currMode,
      calculateCurrentRoute: currCalc,
    } = latestMapStateRef.current;
    currCalc(currOrigin, hit, currWaypoints, currMode);
    clearPickedPlace();
    routeSheetWasExpandedRef.current = false;
  };

  const handlePlaceAddStop = (place: PickedPlace) => {
    const {
      waypoints: currWaypoints,
      destination: currDest,
      origin: currOrigin,
      travelMode: currMode,
      calculateCurrentRoute: currCalc,
    } = latestMapStateRef.current;
    if (currWaypoints.length >= 5) {
      toast.error("Maximum of 5 stops allowed.");
      return;
    }
    const stopHit: Hit = {
      id: place.id,
      name: place.name,
      address: place.kindLabel,
      lat: place.lat,
      lng: place.lng,
    };
    const updated = [...currWaypoints, stopHit];
    setWaypoints(updated);
    toast.success(`Added ${place.name} as stop`);
    if (currDest) {
      currCalc(currOrigin, currDest, updated, currMode);
    }
  };

  const searchMutation = useMutation({
    mutationFn: async (q: string) =>
      (await search({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setHits(data);
      if (data.length === 0) toast.info("No matching places found in Goa.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Search failed"),
  });

  useEffect(() => {
    if (!ready || !locationReady || !searchParams.dest) return;
    const key = JSON.stringify([
      searchParams.dest,
      searchParams.lat,
      searchParams.lng,
      searchParams.stops,
    ]);
    if (requestedTarget.current === key) return;
    requestedTarget.current = key;

    if (
      searchParams.dest &&
      searchParams.lat &&
      searchParams.lng &&
      ready &&
      locationReady
    ) {
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
    } else if (
      searchParams.dest &&
      !searchParams.lat &&
      ready &&
      locationReady
    ) {
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

  return (
    <AppShell
      title="Safe Route Workspace"
      subtitle="Multi-stop route planning & road intelligence"
      back
    >
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
                  {locating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <LocateFixed className="size-3 text-primary" />
                  )}
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
                    if (originQuery.trim().length >= 2)
                      originSearchMutation.mutate(originQuery.trim());
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
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={originSearchMutation.isPending}
                  >
                    {originSearchMutation.isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Search"
                    )}
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
                          calculateCurrentRoute(
                            { lat: h.lat, lng: h.lng, name: h.name },
                            destination,
                            waypoints,
                            travelMode,
                          );
                        }}
                        className="block w-full border-b border-border/30 px-3 py-2 text-left last:border-0 hover:bg-muted text-xs"
                      >
                        <span className="font-bold block text-foreground">
                          {h.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate block">
                          {h.address}
                        </span>
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
                <Milestone className="size-3.5 text-sky-500" /> Stops (
                {waypoints.length}/5)
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
                      <span className="font-bold text-foreground truncate">
                        {wp.name}
                      </span>
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
                          calculateCurrentRoute(
                            origin,
                            destination,
                            copy,
                            travelMode,
                          );
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
                          calculateCurrentRoute(
                            origin,
                            destination,
                            copy,
                            travelMode,
                          );
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
                          calculateCurrentRoute(
                            origin,
                            destination,
                            updated,
                            travelMode,
                          );
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
              <p className="text-[11px] text-muted-foreground">
                Direct route with no intermediate stops.
              </p>
            )}

            {/* Add Stop Search Box */}
            {showAddStop && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (stopQuery.trim().length >= 2)
                      stopSearchMutation.mutate(stopQuery.trim());
                  }}
                >
                  <Input
                    value={stopQuery}
                    placeholder="Search place to add as stop…"
                    onChange={(e) => setStopQuery(e.target.value)}
                    className="h-8 rounded-full text-xs bg-background/80"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={stopSearchMutation.isPending}
                  >
                    {stopSearchMutation.isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Search"
                    )}
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
                          calculateCurrentRoute(
                            origin,
                            destination,
                            updated,
                            travelMode,
                          );
                        }}
                        className="block w-full border-b border-border/30 px-3 py-2 text-left last:border-0 hover:bg-muted text-xs"
                      >
                        <span className="font-bold block text-foreground">
                          {h.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate block">
                          {h.address}
                        </span>
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
                if (query.trim().length >= 2)
                  searchMutation.mutate(query.trim());
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
                {searchMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Navigation className="size-4" />
                )}
              </Button>
            </form>

            {/* Recent Searches Chips */}
            {recentDestinations.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Recent:
                </span>
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
              <span className="text-[10px] text-muted-foreground font-semibold">
                Popular:
              </span>
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
                    <span className="block text-xs font-bold text-foreground">
                      {h.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {h.address}
                    </span>
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
                    ? (
                        routingConfig.supportedModes as readonly string[]
                      ).includes(modeItem.id)
                    : modeItem.id === "car";
                  const isSelected = travelMode === modeItem.id;
                  const Icon = modeItem.icon;

                  return (
                    <button
                      key={modeItem.id}
                      type="button"
                      disabled={!isSupported}
                      title={
                        !isSupported
                          ? "Requires Valhalla routing provider"
                          : modeItem.label
                      }
                      aria-label={`Travel mode: ${modeItem.label}`}
                      onClick={() => {
                        setTravelMode(modeItem.id as any);
                        if (destination) {
                          calculateCurrentRoute(
                            origin,
                            destination,
                            waypoints,
                            modeItem.id as any,
                          );
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
              {routingConfig?.provider === "osrm" && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  (OSRM mode is active: scooter, bike & walk routing require
                  Valhalla)
                </p>
              )}
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
                      if (destination)
                        calculateCurrentRoute(
                          origin,
                          destination,
                          waypoints,
                          travelMode,
                        );
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      departureMode === "now"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    Leave Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDepartureMode("custom");
                      if (destination)
                        calculateCurrentRoute(
                          origin,
                          destination,
                          waypoints,
                          travelMode,
                        );
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                      departureMode === "custom"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
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
                      if (destination)
                        calculateCurrentRoute(
                          origin,
                          destination,
                          waypoints,
                          travelMode,
                        );
                    }}
                    className="h-8 rounded-xl text-xs bg-background/80"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Local IST
                  </span>
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
              <Heart
                className={`size-3.5 ${showSavedPlaces ? "text-coral fill-coral/30" : ""}`}
              />
              <span>
                {showSavedPlaces
                  ? "Hide saved places on map"
                  : "Show saved places on map"}
              </span>
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
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Saved Trips
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowSavedRoutes(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              {savedRoutesList.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No saved routes yet. Plan a trip and click "Save Route".
                </p>
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
                            setDestination({
                              id: "saved",
                              name: d.name,
                              address: d.name,
                              lat: d.lat,
                              lng: d.lng,
                            });
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
                          calculateCurrentRoute(
                            sr.origin,
                            sr.destination,
                            sr.waypoints || [],
                            sr.mode || "car",
                          );
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
                          await supabase
                            .from("saved_routes")
                            .delete()
                            .eq("id", sr.id);
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
              <span className="text-xs font-bold text-primary">
                Calculating optimal routes…
              </span>
            </div>
          )}

          {routes.length > 0 && currentRoute && (
            <div className="space-y-4">
              {/* Comparison Cards */}
              <div className="grid gap-2">
                {comparisonCards.map((choice) => {
                  const r =
                    choice.index !== -1 ? routes[choice.index] : undefined;
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
                        <span className="font-bold text-xs text-foreground">
                          {choice.title}
                        </span>
                        {choice.alsoSafest && (
                          <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
                            Also safest
                          </span>
                        )}
                      </div>
                      <span className="block mt-1 font-bold text-sm text-foreground">
                        {r
                          ? `${r.durationMin} min · ${r.distanceKm} km`
                          : "Unavailable"}
                      </span>
                      <span className="block mt-0.5 text-[11px] text-muted-foreground">
                        {choice.detail}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Route Details Card */}
              <div className="rounded-3xl border border-border/60 bg-card/90 backdrop-blur-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                      <Milestone className="size-4 text-primary" />{" "}
                      {currentRoute.summary}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      <strong>{currentRoute.distanceKm} km</strong> · ~
                      <strong>{currentRoute.durationMin} mins</strong>
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
                          {formatDistance(leg.distanceMeters)} · ~
                          {Math.ceil(leg.durationSeconds / 60)}m
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
                      <li
                        key={idx}
                        className="flex items-start gap-1.5 leading-snug"
                      >
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
                      <ListOrdered className="size-3.5" /> Maneuvers (
                      {currentRoute.steps.length})
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
                              {getManeuverIcon(
                                step.maneuverType,
                                step.maneuverModifier,
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-xs font-bold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}
                              >
                                {step.instruction}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatDistance(step.distanceMeters)}
                                {step.durationSeconds > 0 &&
                                  ` · ~${Math.ceil(step.durationSeconds / 60)}m`}
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

          {/* Live User Location Recenter Control */}
          <div className="absolute top-[146px] right-2.5 z-10 pointer-events-auto">
            <RecenterButton
              followMode={userLocation.followMode}
              pannedAway={userLocation.pannedAway}
              hasPosition={userLocation.position !== null}
              onCycle={userLocation.cycleFollow}
            />
          </div>

          {/* Raster Style Hint Chip */}
          {showRasterChip && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
              <button
                type="button"
                onClick={() => {
                  setActiveStyleId("streets");
                  dismissRasterChip();
                }}
                className="text-xs font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Switch to Streets to tap places on the map</span>
              </button>
              <button
                type="button"
                onClick={dismissRasterChip}
                aria-label="Dismiss hint"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Picked Place Card */}
          {pickedPlace && (
            <PlaceCard
              place={pickedPlace}
              userLocation={
                userLocation.position
                  ? {
                      lat: userLocation.position.lat,
                      lng: userLocation.position.lng,
                    }
                  : null
              }

              savedPlaces={savedPlaces}
              isStopLimitReached={waypoints.length >= 5}
              onClose={handlePlaceClose}
              onDirections={handlePlaceDirections}
              onAddAsStop={handlePlaceAddStop}
            />
          )}

          {/* Loading Shimmer Overlay */}
          {isLoadingMap && !mapLoadError && (
            <div className="absolute inset-0 pointer-events-none bg-muted/30 backdrop-blur-[2px] animate-pulse flex items-center justify-center z-10">
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" /> Loading
                map tiles…
              </span>
            </div>
          )}

          {/* Map Load Error Fallback Overlay */}
          {mapLoadError && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
              <p className="text-sm font-semibold text-foreground mb-3">
                Map tiles could not be loaded.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryMap}
                className="gap-2 rounded-xl text-xs font-bold"
              >
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
                      {currentRoute.durationMin} min · {currentRoute.distanceKm}{" "}
                      km · {currentRoute.label}
                    </span>
                  </div>
                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {sheetExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronUp className="size-4" />
                    )}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleShareRoute}
                        className="h-8 rounded-xl px-3 text-xs"
                      >
                        <Share2 className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveRoute}
                        className="h-8 rounded-xl px-3 text-xs"
                      >
                        <Bookmark className="size-3.5" />
                      </Button>
                    </div>

                    {currentRoute.legs && currentRoute.legs.length > 1 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase text-muted-foreground">
                          Legs
                        </span>
                        {currentRoute.legs.map((leg) => (
                          <div
                            key={leg.legIndex}
                            className="text-[11px] text-foreground flex justify-between"
                          >
                            <span className="truncate max-w-[180px]">
                              {leg.fromName} → {leg.toName}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {formatDistance(leg.distanceMeters)}
                            </span>
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
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-full"
                onClick={() => setShowSavedPicker(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            {savedPlaces.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Your bucket list is empty. Explore places in Goa and tap the
                heart icon to save them!
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {savedPlaces.map((sp) => (
                  <div
                    key={sp.id}
                    className="p-3 rounded-2xl border border-border/40 bg-secondary/30 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-foreground truncate">
                        {sp.place_name}
                      </h4>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                        {sp.category}
                      </span>
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
                          calculateCurrentRoute(
                            origin,
                            destination,
                            updated,
                            travelMode,
                          );
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
                          calculateCurrentRoute(
                            origin,
                            hit,
                            waypoints,
                            travelMode,
                          );
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

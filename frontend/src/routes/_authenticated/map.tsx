import { MapWorkspace } from "@/features/map/components/MapWorkspace";
import { Button } from "@/components/ui/button";
import { ArrowDownUp } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import "@/features/map/components/user-location.css";
import { AppShell } from "@/components/app-shell";
import { useUserLocation } from "@/features/map/hooks/useUserLocation";
import { useMapInstance } from "@/features/map/hooks/useMapInstance";
import { useMapStyle } from "@/features/map/hooks/useMapStyle";
import { useOrigin } from "@/features/map/hooks/useOrigin";
import { useRouteLayers } from "@/features/map/hooks/useRouteLayers";
import {
  useSavedPlaces,
  parseSavedRoute,
} from "@/features/map/hooks/useSavedPlaces";
import { useRoutePlanner } from "@/features/map/hooks/useRoutePlanner";
import { usePlaceActions } from "@/features/map/hooks/usePlaceActions";
import { useMapUrlSync } from "@/features/map/hooks/useMapUrlSync";

import { OriginPicker } from "@/features/map/components/OriginPicker";
import { StopsEditor } from "@/features/map/components/StopsEditor";
import { SearchBar } from "@/features/map/components/SearchBar";
import { RoutePanel } from "@/features/map/components/RoutePanel";
import { SavedRoutesPanel } from "@/features/map/components/SavedRoutesPanel";
import { SavedPlacesPicker } from "@/features/map/components/SavedPlacesPicker";
import { MapViewport } from "@/features/map/components/MapViewport";
import { GoaDiscovery } from "@/features/map/components/GoaDiscovery";

import { resolvedCentre } from "@/lib/resolved-centre";
import { isGoaNight } from "@/features/map/lib/goa-time";
import {
  getRecentSearches,
  saveRecentSearch,
} from "@/features/map/lib/recent-searches";
import type { Hit, TravelMode } from "@/features/map/lib/types";
import {
  MAP_STYLES,
  GOA_CENTER,
  GOA_BOUNDS,
  getDefaultStyleId,
} from "@/lib/map-config";
import {
  getRoutes,
  searchPlaces,
  getRoutingConfig,
} from "@/lib/maps.functions";
import { getCurrentArea } from "@/lib/goa.functions";

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
    const p: {
      dest?: string;
      lat?: string;
      lng?: string;
      origin?: string;
      originLat?: string;
      originLng?: string;
      stops?: string;
    } = {};
    const str = (k: string) =>
      typeof search[k] === "string" ? (search[k] as string).trim() : "";
    const num = (k: string, max: number) => {
      const v = str(k);
      if (!v) return undefined;
      const n = parseFloat(v);
      return Number.isFinite(n) && Math.abs(n) <= max ? v : undefined;
    };
    if (str("dest")) p.dest = str("dest");
    const lat = num("lat", 90);
    if (lat) p.lat = lat;
    const lng = num("lng", 180);
    if (lng) p.lng = lng;
    if (str("origin")) p.origin = str("origin");
    const oLat = num("originLat", 90);
    if (oLat) p.originLat = oLat;
    const oLng = num("originLng", 180);
    if (oLng) p.originLng = oLng;
    if (str("stops")) {
      try {
        if (Array.isArray(JSON.parse(str("stops")))) p.stops = str("stops");
      } catch {
        // ignore malformed stops json
      }
    }
    return p;
  },
  component: MapPage,
});

function MapPage() {
  const searchParams = Route.useSearch();
  const mapEl = useRef<HTMLDivElement>(null);
  const fitMapToRouteFnRef = useRef<() => void>(() => {});
  const routeDataFnRef = useRef<() => void>(() => {});

  const [query, setQuery] = useState(searchParams.dest || "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [destination, setDestination] = useState<Hit | null>(null);
  const [departureMode, setDepartureMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState("19:00");
  const [travelMode, setTravelMode] = useState<TravelMode>("car");
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"discover" | "plan">(
    searchParams.dest ? "plan" : "discover",
  );
  const [activeStyleId, setActiveStyleId] = useState(getDefaultStyleId);
  const [is3d, setIs3d] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<Hit[]>([]);

  useEffect(() => {
    setRecentDestinations(getRecentSearches());
  }, []);

  const resetViewFnRef = useRef<() => void>(() => {});
  const handleResetView = useCallback(() => {
    resetViewFnRef.current();
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

  resetViewFnRef.current = () => {
    const m = mapRef.current;
    if (!m) return;
    if (destination) {
      fitMapToRouteFnRef.current();
    } else {
      m.setMaxBounds(GOA_BOUNDS);
      m.flyTo({ center: GOA_CENTER, zoom: 11, pitch: 0, bearing: 0 });
    }
  };

  const userLocation = useUserLocation({ mapRef, ready, maplibreRef });
  const isNightTime =
    departureMode === "now" ? isGoaNight() : isGoaNight(customTime);

  useEffect(() => {
    if (destination) {
      setWorkspaceView("plan");
      setSheetExpanded(true);
    }
  }, [destination]);
  useEffect(() => {
    if (!ready || !mapEl.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(mapEl.current);
    return () => observer.disconnect();
  }, [ready, mapRef]);
  const search = useServerFn(searchPlaces);
  const route = useServerFn(getRoutes);
  const currentArea = useServerFn(getCurrentArea);
  const routingConfigFn = useServerFn(getRoutingConfig);

  const { data: routingConfig } = useQuery({
    queryKey: ["routing-config"],
    queryFn: async () => await routingConfigFn(),
    staleTime: 60000,
  });

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
    cancelPendingLocation,
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
      if (destination)
        calculateCurrentRoute(coords, destination, waypoints, travelMode);
    },
  });

  const {
    savedPlaces,
    savedPlacesError,
    savedPlacesPending,
    refetchSavedPlaces,
    savedRoutesList,
    savedRoutesError,
    savedRoutesPending,
    refetchSavedRoutes,
    deleteSavedRoute,
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
      calculateCurrentRoute(origin, hit, waypoints, travelMode);
    },
    onAddStop: (hit) => addStop(hit),
  });

  const {
    reorderStop,
    moveStopUp,
    moveStopDown,
    removeStop,
    addStop,
    routes,
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

  const previousPreferences = useRef({ travelMode, isNightTime });
  useEffect(() => {
    const previous = previousPreferences.current;
    previousPreferences.current = { travelMode, isNightTime };
    if (
      previous.travelMode !== travelMode ||
      previous.isNightTime !== isNightTime
    ) {
      calculateCurrentRoute();
    }
  }, [travelMode, isNightTime, calculateCurrentRoute]);

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

  const isCurrentVector =
    MAP_STYLES.find((s) => s.id === activeStyleId)?.isVector ?? true;
  const {
    pickedPlace,
    selectPlace,
    showRasterChip,
    dismissRasterChip,
    handlePlaceClose,
    handlePlaceDirections,
    handlePlaceAddStop,
  } = usePlaceActions({
    ready,
    map: ready ? mapRef.current : null,
    maplibre: ready ? maplibreRef.current : null,
    isVector: isCurrentVector,
    waypoints,
    origin,
    travelMode,
    setDestination,
    setQuery,
    setWaypoints,
    setSheetExpanded,
    setRecentDestinations,
    calculateCurrentRoute,
  });

  useMapUrlSync({
    ready,
    locationReady,
    searchParams,
    origin,
    waypoints,
    travelMode,
    calculateCurrentRoute,
    onSearchDest: (q) => searchMutation.mutate(q),
    setDestination,
    setRecentDestinations,
  });

  const handleSelectOrigin = (h: Hit) => {
    cancelPendingLocation();
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
  };

  const handleSelectDestination = (h: Hit) => {
    setDestination(h);
    setQuery(h.name);
    saveRecentSearch(h);
    setRecentDestinations(getRecentSearches());
    calculateCurrentRoute(origin, h, waypoints, travelMode);
  };

  const handleSelectSavedRoute = (
    sr: import("@/features/map/components/SavedRoutesPanel").SavedRouteItem,
  ) => {
    const { dest, origin: orig, waypoints: wps, mode } = parseSavedRoute(sr);
    if (dest) {
      setDestination(dest);
      setQuery(dest.name);
    }
    if (orig) {
      cancelPendingLocation();
      setOrigin(orig);
      setOriginLabel(orig.name);
      setIsGpsOrigin(false);
    }
    setWaypoints(wps);
    if (mode) setTravelMode(mode);
    setShowSavedRoutes(false);
    toast.success(`Loaded route: ${sr.name}`);
    calculateCurrentRoute(orig || origin, dest, wps, mode || travelMode);
  };

  return (
    <AppShell
      title="Your Goa map"
      subtitle="Discover places, save favourites, and plan your route"
      wide
      back
    >
      <MapWorkspace
        expanded={sheetExpanded}
        onExpand={setSheetExpanded}
        summary={
          routeMutation.isPending
            ? "Updating route…"
            : currentRoute
              ? `${currentRoute.durationMin} min · ${currentRoute.distanceKm} km · ${waypoints.length} stops`
              : destination
                ? `${originLabel} → ${destination.name}`
                : "Choose a place or plan a route"
        }
        planner={
          <>
            <div
              className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1"
              role="group"
              aria-label="Map activity"
            >
              <Button
                variant={workspaceView === "discover" ? "default" : "ghost"}
                aria-pressed={workspaceView === "discover"}
                onClick={() => setWorkspaceView("discover")}
              >
                Discover
              </Button>
              <Button
                variant={workspaceView === "plan" ? "default" : "ghost"}
                aria-pressed={workspaceView === "plan"}
                onClick={() => setWorkspaceView("plan")}
              >
                Plan trip
              </Button>
            </div>
            {workspaceView === "discover" && (
              <>
                <GoaDiscovery
                  map={ready ? mapRef.current : null}
                  onPick={selectPlace}
                />
              </>
            )}
            {workspaceView === "plan" && (
              <>
                <OriginPicker
                  originLabel={originLabel}
                  isGpsOrigin={isGpsOrigin}
                  locating={locating}
                  onRequestLocation={() => requestUserLocation(false)}
                  showOriginSearch={showOriginSearch}
                  setShowOriginSearch={setShowOriginSearch}
                  originQuery={originQuery}
                  setOriginQuery={setOriginQuery}
                  onSearchOrigin={(q) => originSearchMutation.mutate(q)}
                  isSearchingOrigin={originSearchMutation.isPending}
                  originHits={originHits}
                  onSelectOrigin={handleSelectOrigin}
                />
                <SearchBar
                  query={query}
                  setQuery={setQuery}
                  onSearch={(q) => searchMutation.mutate(q)}
                  isSearching={searchMutation.isPending}
                  recentDestinations={recentDestinations}
                  hits={hits}
                  onSelectDestination={handleSelectDestination}
                />
                <Button
                  variant="outline"
                  className="self-end rounded-full"
                  disabled={!destination}
                  onClick={() => {
                    if (!destination) return;
                    cancelPendingLocation();
                    const previousOrigin: Hit = {
                      id: "swapped-origin",
                      name: originLabel,
                      address: "Goa",
                      lat: origin.lat,
                      lng: origin.lng,
                    };
                    const newOrigin = {
                      lat: destination.lat,
                      lng: destination.lng,
                      name: destination.name,
                    };
                    const reversed = [...waypoints].reverse();
                    setOrigin(newOrigin);
                    setOriginLabel(destination.name);
                    setIsGpsOrigin(false);
                    setDestination(previousOrigin);
                    setQuery(previousOrigin.name);
                    setWaypoints(reversed);
                    calculateCurrentRoute(
                      newOrigin,
                      previousOrigin,
                      reversed,
                      travelMode,
                    );
                  }}
                >
                  <ArrowDownUp className="size-4 mr-2" />
                  Swap start and destination
                </Button>
                <StopsEditor
                  waypoints={waypoints}
                  onReorderStop={reorderStop}
                  onMoveStopUp={moveStopUp}
                  onMoveStopDown={moveStopDown}
                  onRemoveStop={removeStop}
                  onOpenBucketList={() => setShowSavedPicker(true)}
                  showAddStop={showAddStop}
                  setShowAddStop={setShowAddStop}
                  stopQuery={stopQuery}
                  setStopQuery={setStopQuery}
                  onSearchStop={(q) => stopSearchMutation.mutate(q)}
                  isSearchingStop={stopSearchMutation.isPending}
                  stopHits={stopHits}
                  onSelectStop={addStop}
                />
                <Button
                  disabled={!destination || routeMutation.isPending}
                  className="rounded-2xl h-11"
                  onClick={() => calculateCurrentRoute()}
                >
                  {routeMutation.isPending
                    ? "Planning your route…"
                    : "Plan route"}
                </Button>
                {routeMutation.isError && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
                  >
                    Routes could not be loaded. Check your connection and try
                    Plan route again.
                  </div>
                )}
                {routeMutation.isSuccess && !routes.length && (
                  <p role="status" className="text-sm p-3">
                    No route was returned for these stops. Try another
                    destination or travel mode.
                  </p>
                )}
                <RoutePanel
                  travelMode={travelMode}
                  setTravelMode={setTravelMode}
                  routingConfig={routingConfig}
                  departureMode={departureMode}
                  setDepartureMode={setDepartureMode}
                  customTime={customTime}
                  setCustomTime={setCustomTime}
                  isNightTime={isNightTime}
                  showSavedPlaces={showSavedPlaces}
                  setShowSavedPlaces={setShowSavedPlaces}
                  showSavedRoutes={showSavedRoutes}
                  setShowSavedRoutes={setShowSavedRoutes}
                  savedRoutesCount={savedRoutesList.length}
                  isCalculatingRoute={routeMutation.isPending}
                  routes={routes}
                  selected={selected}
                  setSelected={setSelected}
                  currentRoute={currentRoute}
                  comparisonCards={comparisonCards}
                  activeStepIndex={activeStepIndex}
                  setActiveStepIndex={setActiveStepIndex}
                  showDirections={showDirections}
                  setShowDirections={setShowDirections}
                  onStepClick={handleStepClick}
                  onShareRoute={handleShareRoute}
                  onSaveRoute={handleSaveRoute}
                />
                <SavedRoutesPanel
                  isOpen={showSavedRoutes}
                  savedRoutesList={savedRoutesList}
                  error={savedRoutesError}
                  pending={savedRoutesPending}
                  onRetry={() => void refetchSavedRoutes()}
                  onClose={() => setShowSavedRoutes(false)}
                  onSelectRoute={handleSelectSavedRoute}
                  onDeleteRoute={deleteSavedRoute}
                />
              </>
            )}
          </>
        }
      >
        <MapViewport
          mapEl={mapEl}
          userLocation={userLocation}
          showRasterChip={showRasterChip}
          onSwitchToStreets={() => {
            setActiveStyleId("streets");
            dismissRasterChip();
          }}
          onDismissRasterChip={dismissRasterChip}
          pickedPlace={pickedPlace}
          savedPlaces={savedPlaces}
          isStopLimitReached={waypoints.length >= 5}
          onClosePlace={handlePlaceClose}
          onDirectionsPlace={handlePlaceDirections}
          onAddStopPlace={handlePlaceAddStop}
          isLoadingMap={isLoadingMap}
          mapLoadError={mapLoadError}
          onRetryMap={handleRetryMap}
        />
      </MapWorkspace>

      <SavedPlacesPicker
        isOpen={showSavedPicker}
        savedPlaces={savedPlaces}
        error={savedPlacesError}
        pending={savedPlacesPending}
        onRetry={() => void refetchSavedPlaces()}
        onClose={() => setShowSavedPicker(false)}
        onAddStop={(sp) => {
          const point = resolvedCentre(sp.lat, sp.lng);
          if (!point) {
            toast.error(
              "This place has no saved coordinates. Search for it to plan a route.",
            );
            return;
          }
          addStop({
            id: sp.id,
            name: sp.place_name,
            address: sp.category || "Goa",
            lat: point.lat,
            lng: point.lng,
          });
          setShowSavedPicker(false);
        }}
        onSetDestination={(sp) => {
          const point = resolvedCentre(sp.lat, sp.lng);
          if (!point) {
            toast.error(
              "This place has no saved coordinates. Search for it to plan a route.",
            );
            return;
          }
          const hit: Hit = {
            id: sp.id,
            name: sp.place_name,
            address: sp.category || "Goa",
            lat: point.lat,
            lng: point.lng,
          };
          handleSelectDestination(hit);
          setShowSavedPicker(false);
          toast.success(`Set destination to ${sp.place_name}`);
        }}
      />
    </AppShell>
  );
}

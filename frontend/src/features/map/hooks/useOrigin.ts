import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Map as MapLibreMap } from "maplibre-gl";
import { DEFAULT_ORIGIN } from "../lib/constants";
import type { Hit } from "../lib/types";

export interface UseOriginOptions {
  map: MapLibreMap | null;
  currentAreaFn: (args: {
    data: { lat: number; lng: number };
  }) => Promise<{ name?: string } | null>;
  searchPlacesFn: (args: { data: { query: string } }) => Promise<Hit[]>;
  initialOrigin?: {
    name?: string | undefined;
    lat?: string | undefined;
    lng?: string | undefined;
  };
  onLocationApplied?: (coords: {
    lat: number;
    lng: number;
    name: string;
  }) => void;
  onStartTracking?: () => void;
}

export function useOrigin({
  map,
  currentAreaFn,
  searchPlacesFn,
  initialOrigin,
  onLocationApplied,
  onStartTracking,
}: UseOriginOptions) {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [originLabel, setOriginLabel] = useState("Detecting location…");
  const [locationReady, setLocationReady] = useState(false);
  const [isGpsOrigin, setIsGpsOrigin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showOriginSearch, setShowOriginSearch] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [originHits, setOriginHits] = useState<Hit[]>([]);

  const onLocationAppliedRef = useRef(onLocationApplied);
  onLocationAppliedRef.current = onLocationApplied;

  const onStartTrackingRef = useRef(onStartTracking);
  onStartTrackingRef.current = onStartTracking;

  const originSearchMutation = useMutation({
    mutationFn: async (q: string) =>
      (await searchPlacesFn({ data: { query: q } })) as Hit[],
    onSuccess: (data) => {
      setOriginHits(data);
      if (data.length === 0) toast.info("No matching starting places found.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Origin search failed"),
  });

  const requestUserLocation = useCallback(
    (isAutomatic = false) => {
      if (!navigator.geolocation) {
        if (!isAutomatic)
          toast.error("Geolocation is not supported by your browser");
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

        if (map) {
          map.flyTo({ center: [lng, lat], zoom: 13 });
        }

        let label = "Your Location";
        try {
          const area = await currentAreaFn({ data: coords });
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

        onStartTrackingRef.current?.();
        if (!isAutomatic) toast.success(`Starting point updated to ${label}`);
        onLocationAppliedRef.current?.(coords);
      };

      const handleFailure = (err?: GeolocationPositionError) => {
        if (err && err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
            () => {
              setLocating(false);
              setLocationReady(true);
              setOriginLabel((prev) =>
                prev.startsWith("Detecting")
                  ? "Panjim (default starting point)"
                  : prev,
              );
              if (!isAutomatic) {
                toast.error(
                  "Could not acquire GPS fix. Please select a starting point manually.",
                );
              }
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 10000 },
          );
          return;
        }

        setLocating(false);
        setLocationReady(true);
        setOriginLabel((prev) =>
          prev.startsWith("Detecting")
            ? "Panjim (default starting point)"
            : prev,
        );
        if (!isAutomatic) {
          if (err?.code === err?.PERMISSION_DENIED) {
            toast.error(
              "Location permission was denied. Please allow location access in your browser settings.",
            );
          } else {
            toast.error(
              "Unable to retrieve location. Using Panjim as fallback.",
            );
          }
        }
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
        handleFailure,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    },
    [map, currentAreaFn],
  );

  // Restore cached origin on mount or request fresh GPS
  useEffect(() => {
    let hasCached = false;
    let cachedIsGps = false;
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
          setOriginLabel(parsed.label || "Last used location");
          cachedIsGps = Boolean(parsed.isGps);
          setIsGpsOrigin(cachedIsGps);
          setLocationReady(true);
          hasCached = true;
          if (cachedIsGps) onStartTrackingRef.current?.();
        }
      }
    } catch {
      // ignore
    }

    // Always fetch fresh GPS if no cache exists OR if the cached origin was GPS-based
    if (!hasCached || cachedIsGps) {
      requestUserLocation(true);
    }
  }, [requestUserLocation]);

  // Handle URL origin params
  useEffect(() => {
    if (initialOrigin?.lat && initialOrigin?.lng) {
      const lat = parseFloat(initialOrigin.lat);
      const lng = parseFloat(initialOrigin.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setOrigin({ lat, lng, name: initialOrigin.name || "Custom Start" });
        setOriginLabel(initialOrigin.name || "Custom Starting Point");
        setIsGpsOrigin(false);
        setLocationReady(true);
      }
    }
  }, [initialOrigin?.name, initialOrigin?.lat, initialOrigin?.lng]);

  return {
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
  };
}

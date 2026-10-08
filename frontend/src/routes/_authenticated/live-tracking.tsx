import "maplibre-gl/dist/maplibre-gl.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  IControl,
} from "maplibre-gl";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Navigation,
  Loader2,
  Phone,
  LocateFixed,
  ShieldCheck,
  Battery,
  Signal,
  Radio,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/live-tracking")({
  component: LiveTrackingPage,
});

interface TeamMember {
  id: string;
  name: string;
  phone: string;
  lat: number;
  lng: number;
  battery: number;
  lastPing: string;
}

const defaultCenter: [number, number] = GOA_CENTER;

const INITIAL_MEMBERS: TeamMember[] = [];

function LiveTrackingPage() {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const memberMarkersRef = useRef<Record<string, MapLibreMarker>>({});
  const meMarkerRef = useRef<MapLibreMarker | null>(null);

  const [members, setMembers] = useState<TeamMember[]>(INITIAL_MEMBERS);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Map style & 3D state (session only)
  const [activeStyleId, setActiveStyleId] = useState(getDefaultStyleId);
  const [is3d, setIs3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [mapLoadError, setMapLoadError] = useState(false);

  const appliedStyleIdRef = useRef<string>(getDefaultStyleId());
  const activeStyleIdRef = useRef(activeStyleId);
  activeStyleIdRef.current = activeStyleId;
  const is3dRef = useRef(is3d);
  is3dRef.current = is3d;

  const handleRetryMap = () => {
    setMapLoadError(false);
    setIsLoadingMap(true);
    const map = mapRef.current;
    if (map) {
      appliedStyleIdRef.current = "osm";
      setActiveStyleId("osm");
      map.setStyle(OSM_RASTER_STYLE);
    }
  };

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    let cancelled = false;

    void import("maplibre-gl").then((ml) => {
      if (cancelled || !mapElRef.current) return;
      maplibreRef.current = ml;
      injectMapCSS();

      const initStyle =
        MAP_STYLES.find((s) => s.id === activeStyleIdRef.current) ??
        MAP_STYLES[0]!;
      appliedStyleIdRef.current = initStyle.id;

      const map = new ml.Map({
        container: mapElRef.current,
        style: initStyle.style,
        center: defaultCenter,
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
          console.warn(
            "[map] Style initialization timed out, falling back to OSM standard tiles...",
          );
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

      map.addControl(
        new ml.NavigationControl({ showCompass: true, showZoom: true }),
        "top-right",
      );
      map.addControl(new ml.FullscreenControl(), "top-right");

      // Style switcher (top-left)
      const switcherDiv = document.createElement("div");
      switcherDiv.className = "safr-style-switcher";
      MAP_STYLES.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "safr-style-btn";
        btn.textContent = s.icon;
        btn.title = s.label;
        btn.setAttribute("aria-label", `Map style: ${s.label}`);
        btn.setAttribute(
          "aria-pressed",
          s.id === activeStyleIdRef.current ? "true" : "false",
        );
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
        onRemove() {
          this._container?.remove();
        }
      }
      map.addControl(new StyleSwitcherControl() as IControl, "top-left");

      // 3D toggle + reset view (top-left)
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
        m.flyTo({ center: defaultCenter, zoom: 11, pitch: 0, bearing: 0 });
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
        onRemove() {
          this._container?.remove();
        }
      }
      map.addControl(new ExtraControlsControl() as IControl, "top-left");

      // Error handler: log resource warnings, never blank screen for minor tile/glyph 404s
      map.on("error", (e) => {
        console.warn("[map resource]", e?.error?.message || e);
      });

      map.on("style.load", () => {
        clearTimeout(loadTimeout);
        setIsLoadingMap(false);
        setMapLoadError(false);
        setReady(true);
        const curStyle =
          MAP_STYLES.find((s) => s.id === activeStyleIdRef.current) ??
          MAP_STYLES[0]!;
        addCustomLayers(map, {
          is3d: is3dRef.current,
          isVector: curStyle.isVector,
        });
      });

      map.on("load", () => {
        clearTimeout(loadTimeout);
        setIsLoadingMap(false);
        setMapLoadError(false);
        setReady(true);

        // Add initial member markers using DOM elements (never HTML strings)
        INITIAL_MEMBERS.forEach((m) => {
          const el = document.createElement("div");
          el.style.cssText =
            "background-color:#06b6d4;color:white;width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;";
          el.textContent = m.name.charAt(0);

          const popupContent = document.createElement("div");
          const nameEl = document.createElement("b");
          nameEl.textContent = m.name;
          const phoneEl = document.createElement("div");
          phoneEl.textContent = m.phone;
          const batteryEl = document.createElement("div");
          batteryEl.textContent = `Battery: ${m.battery}%`;
          popupContent.append(nameEl, phoneEl, batteryEl);

          const marker = new ml.Marker({ element: el })
            .setLngLat([m.lng, m.lat])
            .setPopup(new ml.Popup({ offset: 16 }).setDOMContent(popupContent))
            .addTo(map);
          memberMarkersRef.current[m.id] = marker;
        });
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Style switching
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (activeStyleId !== appliedStyleIdRef.current) {
      appliedStyleIdRef.current = activeStyleId;
      const entry =
        MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;
      map.setStyle(entry.style);
    }

    const btns = map
      .getContainer()
      .querySelectorAll<HTMLButtonElement>(".safr-style-btn");
    btns.forEach((btn, i) => {
      const s = MAP_STYLES[i];
      btn.setAttribute(
        "aria-pressed",
        s?.id === activeStyleId ? "true" : "false",
      );
    });
  }, [activeStyleId, ready]);

  // 3D toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const curStyle =
      MAP_STYLES.find((s) => s.id === activeStyleId) ?? MAP_STYLES[0]!;

    map.easeTo({ pitch: is3d ? 60 : 0, duration: 600 });

    addCustomLayers(map, { is3d, isVector: curStyle.isVector });

    const btn = map
      .getContainer()
      .querySelector<HTMLButtonElement>(".safr-map-ctrl-btn");
    btn?.setAttribute("aria-pressed", is3d ? "true" : "false");
  }, [is3d, ready, activeStyleId]);

  // Track User Location — keep existing "me" marker logic using DOM elements
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMyLocation([latitude, longitude]);

        if (mapRef.current && maplibreRef.current) {
          const ml = maplibreRef.current;
          if (!meMarkerRef.current) {
            const el = document.createElement("div");
            el.style.cssText =
              "background-color:#f97316;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 0 15px rgba(249,115,22,0.6);";
            meMarkerRef.current = new ml.Marker({ element: el })
              .setLngLat([longitude, latitude])
              .setPopup(
                new ml.Popup({ offset: 16 }).setHTML("<b>You (Guardian)</b>"),
              )
              .addTo(mapRef.current);
          } else {
            meMarkerRef.current.setLngLat([longitude, latitude]);
          }
        }
      },
      () =>
        setLocationError("Unable to retrieve high-accuracy GPS coordinates"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    toast.info(
      "Family location sharing is not connected yet. Adding a phone number cannot locate a device.",
    );
  };

  const focusMember = (m: TeamMember) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [m.lng, m.lat], zoom: 15 });
      memberMarkersRef.current[m.id]?.togglePopup();
    }
  };

  return (
    <AppShell
      title="Reunite"
      subtitle="Find the family and friends you registered"
      back
    >
      {/* Radar Header */}
      <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/10 px-3 py-0.5 text-xs font-bold text-cyan">
            <Radio className="size-3.5 animate-pulse" /> Device Location
          </span>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground mt-1.5">
            Your Current Position
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {myLocation
              ? "🟢 GPS Connected (High-Accuracy Mode)"
              : "🟡 Acquiring GPS Satellite Lock…"}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="rounded-full bg-secondary/80 px-3 py-1 text-xs font-bold font-mono">
            {myLocation ? 1 : 0} Connected Devices
          </span>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative mt-6 h-80 sm:h-96 w-full overflow-hidden rounded-3xl border border-border/60 bg-secondary/40 shadow-inner z-0">
        <div ref={mapElRef} className="h-full w-full" />
        {isLoadingMap && !mapLoadError && (
          <div className="absolute inset-0 pointer-events-none bg-muted/30 backdrop-blur-[2px] animate-pulse flex items-center justify-center">
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" /> Loading
              live map…
            </span>
          </div>
        )}
        {mapLoadError && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10">
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
      </div>

      <p
        role="status"
        className="mt-4 rounded-2xl border border-border p-4 text-sm"
      >
        Family device sharing is not configured. No family locations or battery
        levels are simulated. Each family device will need to consent and send
        its own location.
      </p>
      {locationError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {locationError}
        </p>
      )}
      {/* Connect Member Form */}
      <div className="mt-6 rounded-3xl border border-border/60 bg-card/75 backdrop-blur-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold font-display text-foreground mb-3 flex items-center gap-2">
          <Plus className="size-4 text-primary" /> Connect New Family Device
        </h3>
        <form onSubmit={handleAddMember} className="grid sm:grid-cols-3 gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Member Name (e.g. Maya)"
            required
            className="rounded-xl bg-secondary/40 border-border/60"
          />
          <Input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone Number (+91...)"
            required
            className="rounded-xl bg-secondary/40 border-border/60 font-mono"
          />
          <Button
            type="submit"
            disabled
            className="rounded-xl font-bold bg-primary text-primary-foreground shadow-sm hover:scale-102 transition-all"
          >
            Sharing not configured
          </Button>
        </form>
      </div>

      {/* Member Cards */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <div
            key={m.id}
            onClick={() => focusMember(m)}
            className="group rounded-3xl border border-border/50 bg-card/70 backdrop-blur-xl p-5 shadow-sm transition-all hover:shadow-lg hover:border-cyan/40 cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan/10 text-cyan font-bold font-display text-base shrink-0 group-hover:scale-105 transition-transform">
                {m.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-foreground truncate">
                  {m.name}
                </h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1 font-mono">
                    <Battery className="size-3 text-emerald" /> {m.battery}%
                  </span>
                  <span>·</span>
                  <span>{m.lastPing}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`tel:${m.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex size-9 items-center justify-center rounded-full bg-emerald/10 text-emerald hover:bg-emerald/20 transition-colors shadow-xs"
                title={`Call ${m.name}`}
              >
                <Phone className="size-4" />
              </a>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full text-xs font-bold"
                onClick={() => focusMember(m)}
              >
                Focus
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

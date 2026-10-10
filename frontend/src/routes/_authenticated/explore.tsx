import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AlertTriangle,
  ArrowUpDown,
  Ban,
  Bookmark,
  Bus,
  Calendar,
  Camera,
  Car,
  Check,
  CheckSquare,
  Coffee,
  Compass,
  DollarSign,
  Edit3,
  Eye,
  Filter,
  Heart,
  Layers,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Music,
  Navigation,
  Palmtree,
  ParkingCircle,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
  Umbrella,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GOA_PLACES, type PlaceInsights } from "@/lib/goa-schemas";
import { getPlaceInsights } from "@/lib/goa.functions";
import { searchPlaces } from "@/lib/maps.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/explore")({
  component: Explore,
});

type SavedPlace = Database["public"]["Tables"]["saved_places"]["Row"];

const bandStyles: Record<string, string> = {
  unknown: "bg-secondary text-muted-foreground",
  quiet:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
  moderate:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
  busy: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30",
  packed: "bg-destructive/15 text-destructive border border-destructive/30",
};

const severityStyles: Record<string, string> = {
  low: "border-l-blue-500",
  medium: "border-l-amber-500",
  high: "border-l-destructive",
};

const ALL_FEATURED = [
  {
    name: "Baga Beach",
    desc: "Famous for nightlife, water sports, and vibrant shacks.",
    img: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=60&w=400&auto=format&fit=crop",
    category: "beach",
    lat: 15.5553,
    lng: 73.7517,
  },
  {
    name: "Fort Aguada",
    desc: "17th-century Portuguese fort with stunning ocean views.",
    img: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?q=60&w=400&auto=format&fit=crop",
    category: "monument",
    lat: 15.492,
    lng: 73.7737,
  },
  {
    name: "Dudhsagar Waterfalls",
    desc: "Majestic four-tiered waterfall surrounded by lush forests.",
    img: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?q=60&w=400&auto=format&fit=crop",
    category: "nature",
    lat: 15.3144,
    lng: 74.3143,
  },
  {
    name: "Anjuna Flea Market",
    desc: "Bohemian market offering clothes, jewelry, and live music.",
    img: "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?q=60&w=400&auto=format&fit=crop",
    category: "market",
    lat: 15.5804,
    lng: 73.7423,
  },
  {
    name: "Palolem Beach",
    desc: "Scenic, crescent-shaped beach known for its calm waters.",
    img: "https://picsum.photos/seed/palolem/400/250",
    category: "beach",
    lat: 15.01,
    lng: 74.0232,
  },
  {
    name: "Basilica of Bom Jesus",
    desc: "UNESCO World Heritage site holding the mortal remains of St. Francis Xavier.",
    img: "https://picsum.photos/seed/basilica/400/250",
    category: "heritage",
    lat: 15.5009,
    lng: 73.9116,
  },
  {
    name: "Chapora Fort",
    desc: "Iconic fort offering panoramic views of the Arabian Sea and Vagator beach.",
    img: "https://picsum.photos/seed/chapora/400/250",
    category: "monument",
    lat: 15.6058,
    lng: 73.7364,
  },
  {
    name: "Arambol Beach",
    desc: "Laid-back beach popular with backpackers and musicians.",
    img: "https://picsum.photos/seed/arambol/400/250",
    category: "beach",
    lat: 15.6869,
    lng: 73.7042,
  },
];

const EXPLORE_CATEGORIES = [
  {
    label: "Beaches",
    query: "Goa Beach",
    icon: Umbrella,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  {
    label: "Forts & Heritage",
    query: "Goa Fort",
    icon: Camera,
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  {
    label: "Waterfalls & Nature",
    query: "Goa Waterfall",
    icon: Palmtree,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  {
    label: "Markets & Fleas",
    query: "Goa Market",
    icon: MapPin,
    color: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  },
  {
    label: "Cafes & Dining",
    query: "Goa Cafe",
    icon: Coffee,
    color: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  },
  {
    label: "Nightlife & Clubs",
    query: "Goa Club",
    icon: Music,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
];

function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function getTransportIcon(mode?: string) {
  switch (mode) {
    case "car":
      return <Car className="size-5 text-blue-500" />;
    case "bus":
      return <Bus className="size-5 text-emerald-500" />;
    case "ferry":
      return <Ship className="size-5 text-teal-500" />;
    case "walk":
      return <Navigation className="size-5 text-purple-500" />;
    case "scooter":
    default:
      return <Compass className="size-5 text-orange-500" />;
  }
}

function Ship(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76" />
      <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6" />
      <path d="M12 10V4" />
      <path d="M12 2v3" />
    </svg>
  );
}

function Explore() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"explore" | "saved">("explore");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [query, setQuery] = useState("");
  const [shuffledPlaces, setShuffledPlaces] = useState<string[]>([]);
  const [shuffledFeatured, setShuffledFeatured] = useState<typeof ALL_FEATURED>(
    [],
  );

  // Bucket list search & filters
  const [savedSearch, setSavedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "want" | "planned" | "visited"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "name" | "priority" | "nearest"
  >("newest");
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Multi-select mode
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Editing notes state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const insightsFn = useServerFn(getPlaceInsights);
  const searchPlacesFn = useServerFn(searchPlaces);

  // MapLibre container ref for embedded map view
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    shufflePlaces();
    shuffleFeatured();

    // Check session persistence for explore place
    try {
      const lastPlace = sessionStorage.getItem("safr_last_explore_place");
      if (lastPlace && !query) {
        setQuery(lastPlace);
        insights.mutate(lastPlace);
      }
    } catch {
      // sessionStorage unavailable or restricted
    }

    // Attempt to get user geolocation for 'nearest' sorting
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          // Default fallback to central Goa
          setUserLocation({ lat: 15.4989, lng: 73.8278 });
        },
        { timeout: 8000, enableHighAccuracy: true, maximumAge: 0 },
      );
    }
  }, []);

  const shufflePlaces = () => {
    const shuffled = [...GOA_PLACES].sort(() => 0.5 - Math.random());
    setShuffledPlaces(shuffled.slice(0, 6));
  };

  const shuffleFeatured = () => {
    const shuffled = [...ALL_FEATURED].sort(() => 0.5 - Math.random());
    setShuffledFeatured(shuffled.slice(0, 4));
  };

  // Fetch saved places from Supabase
  const { data: savedPlaces = [] } = useQuery({
    queryKey: ["saved-places"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_places")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.warn(
          "Could not fetch saved places from supabase, fallback to empty",
          error,
        );
        return [];
      }
      return data as SavedPlace[];
    },
  });

  // Toggle Save Place with Geocoding Fallback and Optimistic Updates
  const toggleSavePlace = useMutation({
    mutationFn: async ({
      name,
      category,
      imageUrl,
      lat,
      lng,
    }: {
      name: string;
      category?: string;
      imageUrl?: string;
      lat?: number | null | undefined;
      lng?: number | null | undefined;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Please sign in to save places to your bucket list.");
        return;
      }

      const existing = savedPlaces.find(
        (p) => p.place_name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        const { error } = await supabase
          .from("saved_places")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        toast.info(`Removed ${name} from your bucket list`);
        return;
      }

      // Geocode coordinates fallback if missing
      let resolvedLat = lat ?? null;
      let resolvedLng = lng ?? null;

      if (resolvedLat == null || resolvedLng == null) {
        try {
          const geo = await searchPlacesFn({ data: { query: name } });
          if (
            geo &&
            geo.length > 0 &&
            geo[0]?.lat != null &&
            geo[0]?.lng != null
          ) {
            resolvedLat = geo[0].lat;
            resolvedLng = geo[0].lng;
          }
        } catch (e) {
          console.warn("Geocoding lookup fallback failed for", name, e);
        }
      }

      const { error } = await supabase.from("saved_places").insert({
        user_id: userData.user.id,
        place_name: name,
        category: category || "sight",
        image_url: imageUrl || null,
        lat: resolvedLat,
        lng: resolvedLng,
        status: "want",
        priority: 0,
        tags: [],
      });
      if (error) throw error;
      toast.success(`Saved ${name} to your bucket list ❤️`);
    },
    onMutate: async (newPlace) => {
      await queryClient.cancelQueries({ queryKey: ["saved-places"] });
      const previous =
        queryClient.getQueryData<SavedPlace[]>(["saved-places"]) || [];
      const existingIndex = previous.findIndex(
        (p) => p.place_name.toLowerCase() === newPlace.name.toLowerCase(),
      );

      let optimisticList: SavedPlace[];
      if (existingIndex >= 0) {
        optimisticList = previous.filter((_, idx) => idx !== existingIndex);
      } else {
        const optimisticEntry: SavedPlace = {
          id: `temp-${Date.now()}`,
          user_id: "optimistic",
          place_name: newPlace.name,
          category: newPlace.category || "sight",
          image_url: newPlace.imageUrl || null,
          lat: newPlace.lat ?? null,
          lng: newPlace.lng ?? null,
          notes: null,
          priority: 0,
          status: "want",
          planned_date: null,
          tags: [],
          visited_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        optimisticList = [optimisticEntry, ...previous];
      }
      queryClient.setQueryData(["saved-places"], optimisticList);
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["saved-places"], context.previous);
      }
      toast.error(
        err instanceof Error ? err.message : "Could not update saved place",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

  // Update Saved Place attributes (status, priority, notes, planned_date, etc.)
  const updateSavedPlace = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Database["public"]["Tables"]["saved_places"]["Update"]>;
    }) => {
      const { error } = await supabase
        .from("saved_places")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["saved-places"] });
      const previous =
        queryClient.getQueryData<SavedPlace[]>(["saved-places"]) || [];
      const updatedList = previous.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      );
      queryClient.setQueryData(["saved-places"], updatedList);
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["saved-places"], context.previous);
      }
      toast.error(
        err instanceof Error ? err.message : "Failed to update place",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

  // Backfill Missing Coordinates
  const locateMissingCoords = async (place: SavedPlace) => {
    toast.info(`Looking up coordinates for ${place.place_name}…`);
    try {
      const geo = await searchPlacesFn({ data: { query: place.place_name } });
      if (geo && geo.length > 0 && geo[0]?.lat != null && geo[0]?.lng != null) {
        updateSavedPlace.mutate({
          id: place.id,
          updates: { lat: geo[0].lat, lng: geo[0].lng },
        });
        toast.success(`Located ${place.place_name} on map!`);
      } else {
        toast.error(`Could not resolve coordinates for ${place.place_name}.`);
      }
    } catch {
      toast.error(`Geocoding failed for ${place.place_name}.`);
    }
  };

  const isSaved = (name: string) => {
    return savedPlaces.some(
      (p) => p.place_name.toLowerCase() === name.toLowerCase(),
    );
  };

  const insights = useMutation({
    mutationFn: async (place: string) => {
      try {
        sessionStorage.setItem("safr_last_explore_place", place);
      } catch {
        // ignore
      }
      return (await insightsFn({
        data: { place, localTime: new Date().toString() },
      })) as PlaceInsights;
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not load this place"),
  });

  const data = insights.data;

  // Filtered & Sorted Saved Places
  const filteredSavedPlaces = useMemo(() => {
    let list = [...savedPlaces];

    if (savedSearch.trim()) {
      const q = savedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.place_name.toLowerCase().includes(q) ||
          (p.notes && p.notes.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q),
      );
    }

    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }

    if (categoryFilter !== "all") {
      list = list.filter(
        (p) => p.category.toLowerCase() === categoryFilter.toLowerCase(),
      );
    }

    list.sort((a, b) => {
      if (sortBy === "priority") {
        if (a.priority === b.priority) {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        return b.priority - a.priority;
      }
      if (sortBy === "name") {
        return a.place_name.localeCompare(b.place_name);
      }
      if (sortBy === "oldest") {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      if (sortBy === "nearest" && userLocation) {
        const distA =
          a.lat != null && a.lng != null
            ? calculateHaversineDistanceKm(
                userLocation.lat,
                userLocation.lng,
                a.lat,
                a.lng,
              )
            : 99999;
        const distB =
          b.lat != null && b.lng != null
            ? calculateHaversineDistanceKm(
                userLocation.lat,
                userLocation.lng,
                b.lat,
                b.lng,
              )
            : 99999;
        return distA - distB;
      }
      // default: newest
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return list;
  }, [
    savedPlaces,
    savedSearch,
    statusFilter,
    categoryFilter,
    sortBy,
    userLocation,
  ]);

  // Visited Progress Metrics
  const totalCount = savedPlaces.length;
  const visitedCount = savedPlaces.filter((p) => p.status === "visited").length;
  const plannedCount = savedPlaces.filter((p) => p.status === "planned").length;
  const wantCount = savedPlaces.filter((p) => p.status === "want").length;
  const progressPercent =
    totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;

  // Categories list extracted from saved places
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    savedPlaces.forEach((p) => {
      if (p.category) set.add(p.category.toLowerCase());
    });
    return Array.from(set);
  }, [savedPlaces]);

  // Embedded Map initialization and cluster setup
  useEffect(() => {
    if (
      activeTab !== "saved" ||
      viewMode !== "map" ||
      !mapContainerRef.current
    ) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const placesWithCoords = savedPlaces.filter(
      (p): p is SavedPlace & { lat: number; lng: number } =>
        p.lat != null && p.lng != null,
    );

    let cancelled = false;

    void import("maplibre-gl").then((ml) => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new ml.Map({
        container: mapContainerRef.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [73.8278, 15.4989],
        zoom: 9.5,
      });

      mapInstanceRef.current = map;
      map.addControl(
        new ml.NavigationControl({ showCompass: true }),
        "top-right",
      );

      map.on("load", () => {
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: placesWithCoords.map((place) => ({
            type: "Feature",
            properties: {
              id: place.id,
              name: place.place_name,
              category: place.category,
              status: place.status,
              priority: place.priority > 0 ? "yes" : "no",
              notes: place.notes || "",
            },
            geometry: {
              type: "Point",
              coordinates: [place.lng, place.lat],
            },
          })),
        };

        map.addSource("saved-places", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        // Cluster circle layer
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "saved-places",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#0d9488",
              5,
              "#f59e0b",
              10,
              "#e11d48",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              18,
              5,
              24,
              10,
              30,
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Cluster text counter
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "saved-places",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
          paint: {
            "text-color": "#ffffff",
          },
        });

        // Unclustered point markers
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "saved-places",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match",
              ["get", "status"],
              "visited",
              "#10b981",
              "planned",
              "#f59e0b",
              "want",
              "#0d9488",
              "#0d9488",
            ],
            "circle-radius": 8,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Zoom into cluster on click
        map.on("click", "clusters", (e: any) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          });
          const clusterId = features[0]?.properties?.["cluster_id"];
          if (clusterId == null) return;

          const source = map.getSource("saved-places") as any;
          source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
            const geom = features[0]?.geometry;
            if (geom?.type === "Point") {
              map.easeTo({
                center: geom.coordinates as [number, number],
                zoom: zoom ?? map.getZoom() + 2,
              });
            }
          });
        });

        // Click on unclustered point opens DOM-safe popup
        map.on("click", "unclustered-point", (e: any) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;

          const coordinates = feature.geometry.coordinates.slice() as [
            number,
            number,
          ];
          const props = feature.properties as {
            name: string;
            category: string;
            status: string;
            priority: string;
            notes: string;
          };

          const popupEl = document.createElement("div");
          popupEl.className = "p-2 min-w-[200px] text-slate-900";

          const title = document.createElement("h4");
          title.className =
            "font-bold text-sm text-slate-950 flex items-center gap-1.5";
          title.textContent = props.name;
          popupEl.appendChild(title);

          const badgeRow = document.createElement("div");
          badgeRow.className = "flex items-center gap-2 mt-1 mb-2";

          const catBadge = document.createElement("span");
          catBadge.className =
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700";
          catBadge.textContent = props.category;
          badgeRow.appendChild(catBadge);

          const statusBadge = document.createElement("span");
          statusBadge.className = `text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            props.status === "visited"
              ? "bg-emerald-100 text-emerald-700"
              : props.status === "planned"
                ? "bg-amber-100 text-amber-700"
                : "bg-teal-100 text-teal-700"
          }`;
          statusBadge.textContent = props.status;
          badgeRow.appendChild(statusBadge);

          popupEl.appendChild(badgeRow);

          if (props.notes) {
            const notesEl = document.createElement("p");
            notesEl.className =
              "text-xs text-slate-600 mb-2 italic line-clamp-2";
            notesEl.textContent = props.notes;
            popupEl.appendChild(notesEl);
          }

          const navLink = document.createElement("a");
          navLink.className =
            "inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700 underline";
          navLink.textContent = "Get directions in Map →";
          navLink.href = `/map?dest=${encodeURIComponent(props.name)}&lat=${coordinates[1]}&lng=${coordinates[0]}`;
          popupEl.appendChild(navLink);

          new ml.Popup({ offset: 12 })
            .setDOMContent(popupEl)
            .setLngLat(coordinates)
            .addTo(map);
        });

        // Cursor pointer effects
        map.on(
          "mouseenter",
          "clusters",
          () => (map.getCanvas().style.cursor = "pointer"),
        );
        map.on(
          "mouseleave",
          "clusters",
          () => (map.getCanvas().style.cursor = ""),
        );
        map.on(
          "mouseenter",
          "unclustered-point",
          () => (map.getCanvas().style.cursor = "pointer"),
        );
        map.on(
          "mouseleave",
          "unclustered-point",
          () => (map.getCanvas().style.cursor = ""),
        );

        // Fit map to show all places
        if (placesWithCoords.length > 0) {
          const bounds = new ml.LngLatBounds();
          placesWithCoords.forEach((p) => bounds.extend([p.lng, p.lat]));
          map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 800 });
        }
      });
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, viewMode, savedPlaces]);

  // Multi-select batch handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredSavedPlaces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSavedPlaces.map((p) => p.id)));
    }
  };

  const handlePlanRouteThroughSelected = () => {
    const selectedPlaces = savedPlaces.filter((p) => selectedIds.has(p.id));
    const validCoords = selectedPlaces.filter(
      (p): p is SavedPlace & { lat: number; lng: number } =>
        p.lat != null && p.lng != null,
    );

    if (validCoords.length < 2) {
      toast.error(
        "Please select at least 2 saved places with valid map coordinates to plan a route.",
      );
      return;
    }

    if (validCoords.length > 7) {
      toast.warning(
        "Routing supports origin, destination, and up to 5 intermediate stops. Taking the first 7 selected.",
      );
    }

    const routeStops = validCoords.slice(0, 7);
    const origin = routeStops[0];
    const destination = routeStops[routeStops.length - 1];

    if (!origin || !destination) {
      return;
    }

    const intermediates = routeStops
      .slice(1, routeStops.length - 1)
      .map((s) => ({
        lat: s.lat,
        lng: s.lng,
        name: s.place_name,
      }));

    const searchParams: {
      dest: string;
      lat: string;
      lng: string;
      originLat: string;
      originLng: string;
      originName: string;
      stops?: string;
    } = {
      dest: destination.place_name,
      lat: String(destination.lat),
      lng: String(destination.lng),
      originLat: String(origin.lat),
      originLng: String(origin.lng),
      originName: origin.place_name,
    };

    if (intermediates.length > 0) {
      searchParams.stops = JSON.stringify(intermediates);
    }

    navigate({
      to: "/map",
      search: searchParams,
    });
  };

  const handleBatchMarkVisited = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("saved_places")
        .update({ status: "visited", visited_at: now })
        .in("id", ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      toast.success(`Marked ${ids.length} places as visited!`);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update places");
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from("saved_places")
        .delete()
        .in("id", ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
      toast.info(`Removed ${ids.length} places from your bucket list`);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete places");
    }
  };

  return (
    <AppShell
      title="Explore Goa"
      subtitle="Food, sights, crowd levels, transport & saved bucket list"
      back
    >
      {/* View Switcher Tabs: Explore vs Saved Bucket List */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-2 p-1.5 bg-secondary/50 rounded-full border border-border/40">
          <button
            onClick={() => setActiveTab("explore")}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all ${
              activeTab === "explore"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className="size-4" /> Explore Destinations
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all ${
              activeTab === "saved"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart
              className={`size-4 ${savedPlaces.length > 0 ? "fill-rose-500 text-rose-500" : ""}`}
            />
            Saved Bucket List ({savedPlaces.length})
          </button>
        </div>

        {activeTab === "saved" && savedPlaces.length > 0 && (
          <div className="flex items-center gap-2 bg-secondary/40 p-1 rounded-full border border-border/40">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                viewMode === "list"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" /> List View
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                viewMode === "map"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="size-3.5" /> Map View
            </button>
          </div>
        )}
      </div>

      {/* SAVED PLACES BUCKET LIST TAB */}
      {activeTab === "saved" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header & Visited Progress Bar */}
          <div className="rounded-3xl border border-border/50 bg-card/70 backdrop-blur-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Heart className="size-5 fill-rose-500 text-rose-500" /> Your
                  Goa Bucket List
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Track must-visit spots, set travel priorities, and plan
                  multi-stop routes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {savedPlaces.length > 0 && (
                  <Button
                    variant={isMultiSelect ? "default" : "outline"}
                    size="sm"
                    className="rounded-full gap-1.5 font-bold text-xs"
                    onClick={() => {
                      setIsMultiSelect(!isMultiSelect);
                      setSelectedIds(new Set());
                    }}
                  >
                    {isMultiSelect ? (
                      <Check className="size-3.5" />
                    ) : (
                      <CheckSquare className="size-3.5" />
                    )}
                    {isMultiSelect ? "Done Selecting" : "Select Mode"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full gap-1 text-xs font-bold"
                  onClick={() => setActiveTab("explore")}
                >
                  <Plus className="size-3.5" /> Discover more
                </Button>
              </div>
            </div>

            {/* Travel Progress Bar */}
            {totalCount > 0 && (
              <div className="mt-5 pt-5 border-t border-border/40">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-amber-500" /> Travel
                    Completion Progress
                  </span>
                  <span className="font-bold text-primary">
                    {visitedCount} of {totalCount} visited ({progressPercent}%)
                  </span>
                </div>
                <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700 rounded-full"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-emerald-500" />{" "}
                    {visitedCount} Visited
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-amber-500" />{" "}
                    {plannedCount} Planned
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-teal-500" />{" "}
                    {wantCount} Want to visit
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Empty State */}
          {savedPlaces.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 p-10 text-center bg-secondary/20">
              <Bookmark className="size-12 mx-auto text-muted-foreground/40 mb-3" />
              <h4 className="text-lg font-bold">Your bucket list is empty</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Explore popular beaches, historic forts, lush waterfalls, and
                cafes in Goa. Click the heart icon to save destinations and
                organize your itinerary!
              </p>
              <Button
                onClick={() => setActiveTab("explore")}
                className="mt-6 rounded-full font-semibold px-6 shadow-md"
              >
                Start Exploring Goa
              </Button>
            </div>
          ) : (
            <>
              {/* Search, Status Tabs, Category Filter & Sort Bar */}
              <div className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                  <div className="relative flex-1">
                    <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search bucket list by name or note…"
                      value={savedSearch}
                      onChange={(e) => setSavedSearch(e.target.value)}
                      className="pl-9 h-10 rounded-full text-xs bg-background/80"
                    />
                    {savedSearch && (
                      <button
                        onClick={() => setSavedSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <ArrowUpDown className="size-3.5" /> Sort:
                    </span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      aria-label="Sort bucket list places"
                      className="h-9 rounded-full px-3 text-xs bg-secondary border border-border/40 font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="newest">Newest Added</option>
                      <option value="priority">Priority Starred</option>
                      <option value="name">Name (A-Z)</option>
                      <option value="nearest">Nearest to Me</option>
                      <option value="oldest">Oldest Added</option>
                    </select>
                  </div>
                </div>

                {/* Status & Category Filters */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: "all", label: "All" },
                        { id: "want", label: "Want to visit" },
                        { id: "planned", label: "Planned" },
                        { id: "visited", label: "Visited" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                          statusFilter === tab.id
                            ? tab.id === "visited"
                              ? "bg-emerald-600 text-white"
                              : tab.id === "planned"
                                ? "bg-amber-600 text-white"
                                : "bg-teal-600 text-white"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {availableCategories.length > 1 && (
                    <div className="flex items-center gap-1 text-xs">
                      <Filter className="size-3 text-muted-foreground" />
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        aria-label="Filter bucket list by category"
                        className="h-8 rounded-full px-2.5 text-xs bg-secondary border border-border/40 font-medium focus:outline-none"
                      >
                        <option value="all">All Categories</option>
                        {availableCategories.map((c) => (
                          <option key={c} value={c} className="capitalize">
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Select Floating Action Bar */}
              {isMultiSelect && (
                <div className="sticky top-20 z-30 flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-primary/30 shadow-lg backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAll}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedIds.size === filteredSavedPlaces.length ? (
                        <CheckSquare className="size-4" />
                      ) : (
                        <Square className="size-4" />
                      )}
                      {selectedIds.size === filteredSavedPlaces.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      ({selectedIds.size} selected)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={selectedIds.size < 2}
                      onClick={handlePlanRouteThroughSelected}
                      className="rounded-full text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white gap-1.5 shadow-sm"
                    >
                      <RouteIcon className="size-3.5" /> Plan Multi-Stop Route
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectedIds.size === 0}
                      onClick={handleBatchMarkVisited}
                      className="rounded-full text-xs font-bold text-emerald-600 hover:bg-emerald-500/10 gap-1"
                    >
                      <Check className="size-3.5" /> Mark Visited
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={selectedIds.size === 0}
                      onClick={handleBatchDelete}
                      className="rounded-full text-xs font-bold gap-1"
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              )}

              {/* MAP VIEW CONTAINER */}
              {viewMode === "map" ? (
                <div className="space-y-4">
                  <div className="relative rounded-3xl overflow-hidden border border-border/50 shadow-md">
                    <div
                      ref={mapContainerRef}
                      className="h-[480px] w-full bg-secondary/30"
                    />
                    <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-md px-3 py-2 rounded-xl border border-border/50 text-xs shadow-md space-y-1">
                      <p className="font-bold text-foreground">
                        Map Pins Legend
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <span className="size-2.5 rounded-full bg-emerald-500" />{" "}
                          Visited
                        </span>
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <span className="size-2.5 rounded-full bg-amber-500" />{" "}
                          Planned
                        </span>
                        <span className="flex items-center gap-1 text-teal-600 font-medium">
                          <span className="size-2.5 rounded-full bg-teal-500" />{" "}
                          Want to visit
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Places without Coordinates Notice */}
                  {savedPlaces.some((p) => p.lat == null || p.lng == null) && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="size-4 shrink-0" />
                        Some places are not shown on the map because they lack
                        pinned coordinates:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {savedPlaces
                          .filter((p) => p.lat == null || p.lng == null)
                          .map((place) => (
                            <button
                              key={place.id}
                              onClick={() => locateMissingCoords(place)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-card border border-amber-500/40 hover:bg-amber-500/20 text-foreground transition-all"
                            >
                              <LocateFixed className="size-3 text-amber-600" />{" "}
                              Locate {place.place_name}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* LIST VIEW CARDS */
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredSavedPlaces.length === 0 ? (
                    <div className="col-span-full py-12 text-center rounded-2xl border border-dashed border-border/60 bg-secondary/10">
                      <p className="text-sm font-semibold text-muted-foreground">
                        No saved places match your search or filter.
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setSavedSearch("");
                          setStatusFilter("all");
                          setCategoryFilter("all");
                        }}
                      >
                        Reset filters
                      </Button>
                    </div>
                  ) : (
                    filteredSavedPlaces.map((place) => {
                      const isSelected = selectedIds.has(place.id);
                      const isPriority = place.priority > 0;
                      const distance =
                        userLocation && place.lat != null && place.lng != null
                          ? calculateHaversineDistanceKm(
                              userLocation.lat,
                              userLocation.lng,
                              place.lat,
                              place.lng,
                            )
                          : null;

                      const directionsSearch: {
                        dest: string;
                        lat?: string;
                        lng?: string;
                      } = {
                        dest: place.place_name,
                      };
                      if (place.lat != null)
                        directionsSearch.lat = String(place.lat);
                      if (place.lng != null)
                        directionsSearch.lng = String(place.lng);

                      return (
                        <div
                          key={place.id}
                          className={`group relative overflow-hidden rounded-3xl border transition-all hover:shadow-lg ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-md"
                              : "border-border/50 bg-card/80 backdrop-blur-md"
                          }`}
                        >
                          <div className="p-5">
                            {/* Card Top Row: Status badge, Priority Star, and Multi-select / Delete */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                {isMultiSelect && (
                                  <button
                                    onClick={() => handleToggleSelect(place.id)}
                                    className="p-1 rounded-md hover:bg-secondary text-primary transition-colors"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="size-5 fill-primary text-primary-foreground" />
                                    ) : (
                                      <Square className="size-5 text-muted-foreground" />
                                    )}
                                  </button>
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary px-2.5 py-0.5 rounded-full bg-primary/10">
                                  {place.category}
                                </span>
                                {distance != null && (
                                  <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-0.5">
                                    <Compass className="size-3 text-teal-600" />{" "}
                                    {distance} km
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {/* Priority Toggle */}
                                <button
                                  onClick={() =>
                                    updateSavedPlace.mutate({
                                      id: place.id,
                                      updates: { priority: isPriority ? 0 : 1 },
                                    })
                                  }
                                  className={`p-1.5 rounded-full transition-colors ${
                                    isPriority
                                      ? "text-amber-500 hover:bg-amber-500/10"
                                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"
                                  }`}
                                  title={
                                    isPriority
                                      ? "Must-visit priority"
                                      : "Mark as priority"
                                  }
                                >
                                  <Star
                                    className={`size-4 ${isPriority ? "fill-amber-500" : ""}`}
                                  />
                                </button>

                                {/* Remove Button */}
                                <button
                                  onClick={() =>
                                    toggleSavePlace.mutate({
                                      name: place.place_name,
                                    })
                                  }
                                  className="rounded-full bg-rose-500/10 p-1.5 text-rose-600 hover:bg-rose-500/20 transition-colors"
                                  title="Remove from saved"
                                >
                                  <Heart className="size-4 fill-rose-500" />
                                </button>
                              </div>
                            </div>

                            {/* Place Name & Location Coordinates Status */}
                            <div className="mt-2">
                              <h4 className="text-lg font-bold text-foreground flex items-center justify-between">
                                <span>{place.place_name}</span>
                              </h4>
                              {place.lat == null || place.lng == null ? (
                                <button
                                  onClick={() => locateMissingCoords(place)}
                                  className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5 hover:underline"
                                >
                                  <LocateFixed className="size-3" /> No map pin
                                  — click to locate
                                </button>
                              ) : (
                                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <MapPin className="size-3 text-emerald-500" />{" "}
                                  Lat {place.lat.toFixed(4)}, Lng{" "}
                                  {place.lng.toFixed(4)}
                                </p>
                              )}
                            </div>

                            {/* Status Selector Dropdown & Planned Date */}
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/40">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-muted-foreground">
                                  Status:
                                </span>
                                <select
                                  value={place.status}
                                  onChange={(e) => {
                                    const nextStatus = e.target.value as
                                      "want" | "planned" | "visited";
                                    updateSavedPlace.mutate({
                                      id: place.id,
                                      updates: {
                                        status: nextStatus,
                                        visited_at:
                                          nextStatus === "visited"
                                            ? new Date().toISOString()
                                            : null,
                                      },
                                    });
                                  }}
                                  aria-label={`Status for ${place.place_name}`}
                                  className={`h-7 px-2.5 rounded-full text-xs font-bold border transition-colors focus:outline-none ${
                                    place.status === "visited"
                                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                      : place.status === "planned"
                                        ? "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400"
                                        : "bg-teal-500/15 border-teal-500/30 text-teal-700 dark:text-teal-400"
                                  }`}
                                >
                                  <option value="want">Want to visit</option>
                                  <option value="planned">Planned</option>
                                  <option value="visited">Visited</option>
                                </select>
                              </div>

                              <div className="flex items-center gap-1">
                                <Calendar className="size-3 text-muted-foreground" />
                                <input
                                  type="date"
                                  value={place.planned_date || ""}
                                  onChange={(e) =>
                                    updateSavedPlace.mutate({
                                      id: place.id,
                                      updates: {
                                        planned_date: e.target.value || null,
                                      },
                                    })
                                  }
                                  aria-label={`Target travel date for ${place.place_name}`}
                                  className="h-7 text-[11px] bg-secondary/50 rounded-lg px-2 border border-border/40 text-foreground focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* Editable Notes Section */}
                            <div className="mt-3">
                              {editingNotesId === place.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={notesDraft}
                                    onChange={(e) =>
                                      setNotesDraft(e.target.value)
                                    }
                                    placeholder="Add tips, sunset spots, restaurant orders, parking advice..."
                                    rows={2}
                                    className="w-full text-xs p-2 rounded-xl bg-background border border-border focus:ring-1 focus:ring-primary focus:outline-none"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => setEditingNotesId(null)}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-6 px-2 text-[10px] font-bold"
                                      onClick={() => {
                                        updateSavedPlace.mutate({
                                          id: place.id,
                                          updates: {
                                            notes: notesDraft.trim() || null,
                                          },
                                        });
                                        setEditingNotesId(null);
                                      }}
                                    >
                                      Save Notes
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => {
                                    setEditingNotesId(place.id);
                                    setNotesDraft(place.notes || "");
                                  }}
                                  className="group/note flex items-center justify-between text-xs p-2 rounded-xl bg-secondary/30 hover:bg-secondary/60 cursor-pointer border border-border/30 transition-colors"
                                >
                                  <p className="text-muted-foreground line-clamp-1 italic">
                                    {place.notes ||
                                      "Click to add personal notes or reminders…"}
                                  </p>
                                  <Edit3 className="size-3 text-muted-foreground opacity-50 group-hover/note:opacity-100 shrink-0 ml-1" />
                                </div>
                              )}
                            </div>

                            {/* Card Action Buttons */}
                            <div className="mt-4 flex items-center gap-2 pt-3 border-t border-border/40">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setActiveTab("explore");
                                  setQuery(place.place_name);
                                  insights.mutate(place.place_name);
                                }}
                                className="flex-1 rounded-full text-xs font-bold gap-1"
                              >
                                <Eye className="size-3.5" /> View Insights
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                className="flex-1 rounded-full text-xs font-bold bg-primary text-primary-foreground gap-1"
                              >
                                <Link to="/map" search={directionsSearch}>
                                  <Navigation className="size-3.5" /> Directions
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* EXPLORE PLACES TAB */}
      {activeTab === "explore" && (
        <>
          {/* Search Form */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const place = query.trim();
              if (place.length < 2) return;
              insights.mutate(place);
            }}
          >
            <Input
              value={query}
              maxLength={80}
              placeholder="Search beaches, forts, waterfalls, markets in Goa…"
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 text-base rounded-full bg-card/70 border-border/50"
            />
            <Button
              type="submit"
              disabled={insights.isPending}
              className="h-12 px-6 rounded-full font-bold"
            >
              <Search className="size-4 mr-1.5" /> Explore
            </Button>
          </form>

          {/* Quick Category Chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {EXPLORE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.label}
                  onClick={() => {
                    setQuery(cat.query);
                    insights.mutate(cat.query);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all hover:scale-105 active:scale-95 ${cat.color}`}
                >
                  <Icon className="size-3.5" /> {cat.label}
                </button>
              );
            })}
          </div>

          {/* Quick Suggestions Chips */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground mr-1">
              Trending:
            </span>
            {shuffledPlaces.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setQuery(p);
                  insights.mutate(p);
                }}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-all"
              >
                {p}
              </button>
            ))}
            <button
              onClick={shufflePlaces}
              type="button"
              title="Refresh suggestions"
              className="flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-200 transition-all hover:rotate-180 active:scale-95"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>

          {/* Featured Destinations (Empty Search State) */}
          {!data && !insights.isPending && (
            <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    <Star className="text-orange-500 w-5 h-5 fill-orange-500" />{" "}
                    Featured Goa Destinations
                  </h3>
                  <button
                    onClick={shuffleFeatured}
                    type="button"
                    title="Refresh destinations"
                    className="flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 p-1.5 text-orange-600 hover:bg-orange-200 transition-all hover:rotate-180 active:scale-95"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {shuffledFeatured.map((place) => {
                    const saved = isSaved(place.name);
                    return (
                      <div
                        key={place.name}
                        className="group relative overflow-hidden rounded-3xl border border-border/50 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1"
                      >
                        <div
                          onClick={() => {
                            setQuery(place.name);
                            insights.mutate(place.name);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors z-10" />
                          <img
                            src={place.img}
                            alt={place.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-44 object-cover transition-transform duration-700 group-hover:scale-110 bg-secondary"
                          />
                          <div className="absolute bottom-0 left-0 right-0 p-4 z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
                            <h4 className="text-white font-bold text-base flex items-center justify-between">
                              <span>{place.name}</span>
                              {saved && (
                                <span className="text-[10px] bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full">
                                  Saved
                                </span>
                              )}
                            </h4>
                            <p className="text-white/80 text-xs mt-1 line-clamp-1">
                              {place.desc}
                            </p>
                          </div>
                        </div>

                        {/* Bookmark Heart Action */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSavePlace.mutate({
                              name: place.name,
                              category: place.category,
                              imageUrl: place.img,
                              lat: place.lat,
                              lng: place.lng,
                            });
                          }}
                          className={`absolute top-3 right-3 z-30 rounded-full p-2 backdrop-blur-md transition-all hover:scale-110 ${
                            saved
                              ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                              : "bg-black/40 text-white hover:bg-black/60"
                          }`}
                          title={
                            saved
                              ? "Saved in bucket list"
                              : "Save to bucket list"
                          }
                        >
                          <Heart
                            className={`size-4 ${saved ? "fill-white" : ""}`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* Loading Indicator */}
          {insights.isPending && (
            <div className="mt-16 flex flex-col items-center gap-3 text-muted-foreground animate-in fade-in">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium">
                Gathering travel intel on {query}…
              </p>
            </div>
          )}

          {/* PLACE INSIGHT RESULTS */}
          {data && !insights.isPending && (
            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500">
              {/* Place Overview Header Card */}
              <section className="rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold tracking-widest text-primary uppercase">
                      Destination Insights
                    </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-foreground mt-1">
                      {data.place}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Save to Bucket List Button */}
                    <button
                      onClick={() =>
                        toggleSavePlace.mutate({
                          name: data.place,
                          category: "sight",
                          lat: data.sights?.[0]?.lat ?? null,
                          lng: data.sights?.[0]?.lng ?? null,
                        })
                      }
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95 ${
                        isSaved(data.place)
                          ? "bg-rose-500 text-white shadow-rose-500/20"
                          : "bg-secondary text-foreground hover:bg-rose-500/10 hover:text-rose-600 border border-border/50"
                      }`}
                    >
                      <Heart
                        className={`size-4 ${isSaved(data.place) ? "fill-white" : ""}`}
                      />
                      {isSaved(data.place)
                        ? "Saved in Bucket List"
                        : "Save to Bucket List"}
                    </button>

                    <Button asChild variant="outline" className="rounded-full">
                      <Link
                        to="/itinerary"
                        search={{ place: data.place, state: "Goa" }}
                      >
                        Plan time here
                      </Link>
                    </Button>

                    {/* Open on Map Button */}
                    {(() => {
                      const searchMap: {
                        dest: string;
                        lat?: string;
                        lng?: string;
                      } = {
                        dest: data.place,
                      };
                      if (data.sights?.[0]?.lat != null)
                        searchMap.lat = String(data.sights[0].lat);
                      if (data.sights?.[0]?.lng != null)
                        searchMap.lng = String(data.sights[0].lng);
                      return (
                        <Button
                          asChild
                          className="rounded-full font-bold shadow-md gap-1.5"
                        >
                          <Link to="/map" search={searchMap}>
                            <Navigation className="size-4" /> Open on Map
                          </Link>
                        </Button>
                      );
                    })()}
                  </div>
                </div>

                <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                  {data.summary}
                </p>
              </section>

              {/* BEST MODE OF TRANSPORT CARD */}
              {data.transport_advice && (
                <section className="rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                      {getTransportIcon(data.transport_advice.best_mode)}
                      Best Mode of Transport: {data.transport_advice.title}
                    </h3>
                    <span className="rounded-full bg-primary/10 text-primary text-xs font-bold px-3 py-1 uppercase tracking-wider">
                      Recommended
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-foreground/90 leading-relaxed">
                    {data.transport_advice.description}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/40 bg-secondary/30 p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <DollarSign className="size-3.5 text-emerald-500" />{" "}
                        Estimated Cost
                      </span>
                      <p className="text-sm font-bold text-foreground mt-1">
                        {data.transport_advice.estimated_cost}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-secondary/30 p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <ParkingCircle className="size-3.5 text-blue-500" />{" "}
                        Parking Availability
                      </span>
                      <p className="text-sm font-bold text-foreground mt-1 capitalize">
                        {data.transport_advice.parking_ease}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.transport_advice.parking_tip}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-secondary/30 p-4">
                      <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Compass className="size-3.5 text-orange-500" /> Road
                        Conditions
                      </span>
                      <p className="text-xs font-medium text-foreground mt-1">
                        {data.transport_advice.road_condition}
                      </p>
                    </div>
                  </div>

                  {data.transport_advice.safety_tips.length > 0 && (
                    <div className="mt-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                        Transit & Road Safety Tips
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-amber-900/90 dark:text-amber-300">
                        {data.transport_advice.safety_tips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span>•</span> <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.transport_advice.public_transit && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Bus className="size-4 text-primary shrink-0" />
                      <span>{data.transport_advice.public_transit}</span>
                    </div>
                  )}
                </section>
              )}

              {/* Crowd Level & Smart Alternatives */}
              <section className="rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-bold text-lg">
                    <Users className="size-5 text-primary" /> Crowd Information
                  </h3>
                  <span
                    className={`rounded-full px-3.5 py-1 text-xs font-bold capitalize ${bandStyles[data.crowd.band]}`}
                  >
                    {data.crowd.percent == null
                      ? "Unavailable"
                      : `${data.crowd.percent}% · ${data.crowd.band}`}
                  </span>
                </div>

                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 via-orange-500 to-rose-500 transition-all duration-1000"
                    style={{ width: `${data.crowd.percent ?? 0}%` }}
                  />
                </div>

                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {data.crowd.reason}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  <span className="text-primary font-bold">
                    Best visiting time today:
                  </span>{" "}
                  {data.crowd.best_time_today}
                </p>

                <div className="mt-5 space-y-2.5">
                  <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    Nearby alternatives (when available)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.crowd.alternatives.map((alt) => (
                      <div
                        key={alt.name}
                        onClick={() => {
                          setQuery(alt.name);
                          insights.mutate(alt.name);
                        }}
                        className="rounded-2xl border border-border/40 bg-secondary/40 p-4 cursor-pointer hover:border-primary/40 hover:bg-secondary/70 transition-all"
                      >
                        <p className="text-sm font-bold text-foreground flex items-center justify-between">
                          <span>{alt.name}</span>
                          <span className="text-xs text-muted-foreground font-normal">
                            {alt.travel_time}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {alt.why}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Recommendations Bento: Eat, Do, Sights */}
              {(
                [
                  ["Where to Eat & Beach Shacks", data.eat, "🍤"],
                  ["Things to Do & Water Sports", data.activities, "🎯"],
                  ["Sights & Cultural Landmarks", data.sights, "🏛️"],
                ] as const
              ).map(([heading, items, emoji]) => (
                <section
                  key={heading}
                  className="rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 shadow-sm"
                >
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <span>{emoji}</span> {heading}
                  </h3>
                  {items.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No mapped listings found in this category.
                    </p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {items.map((item) => {
                      const itemSearch: {
                        dest: string;
                        lat?: string;
                        lng?: string;
                      } = {
                        dest: item.name,
                      };
                      if (item.lat != null) itemSearch.lat = String(item.lat);
                      if (item.lng != null) itemSearch.lng = String(item.lng);

                      return (
                        <div
                          key={item.name}
                          className="rounded-2xl border border-border/40 bg-secondary/30 p-4 flex flex-col justify-between"
                        >
                          <div>
                            <p className="font-bold text-sm text-foreground">
                              {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                          <p className="mt-3 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg w-fit">
                            {item.tip}
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/30 pt-2">
                            {item.lat != null && item.lng != null ? (
                              <Link
                                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                                to="/map"
                                search={itemSearch}
                              >
                                <Navigation className="size-3" /> Map
                              </Link>
                            ) : (
                              <span />
                            )}
                            <button
                              onClick={() =>
                                toggleSavePlace.mutate({
                                  name: item.name,
                                  category: heading.includes("Eat")
                                    ? "food"
                                    : "sight",
                                  lat: item.lat,
                                  lng: item.lng,
                                })
                              }
                              className={`p-1.5 rounded-full transition-colors ${
                                isSaved(item.name)
                                  ? "text-rose-500 bg-rose-500/10"
                                  : "text-muted-foreground hover:text-rose-500 hover:bg-secondary"
                              }`}
                              title="Save to bucket list"
                            >
                              <Heart
                                className={`size-3.5 ${isSaved(item.name) ? "fill-rose-500" : ""}`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {/* Local Rules & Safety Warnings */}
              <section className="rounded-3xl border border-border/50 bg-card/80 backdrop-blur-xl p-6 shadow-sm">
                <h3 className="font-bold text-lg mb-4">
                  Visitor Guidance for {data.place}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                      Visitor Guidance
                    </p>
                    <ul className="space-y-2">
                      {data.rules.allowed.map((r) => (
                        <li
                          key={r}
                          className="flex gap-2 text-sm text-emerald-950 dark:text-emerald-300"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{" "}
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl bg-red-500/5 border border-red-500/20 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400 mb-2">
                      Respect Access Restrictions
                    </p>
                    <ul className="space-y-2">
                      {data.rules.not_allowed.map((r) => (
                        <li
                          key={r}
                          className="flex gap-2 text-sm text-red-950 dark:text-red-300"
                        >
                          <Ban className="mt-0.5 size-4 shrink-0 text-red-600" />{" "}
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Safety Warnings */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-bold text-lg">
                  <AlertTriangle className="size-5 text-destructive" /> Safety
                  Warnings & Local Advisories
                </h3>
                {data.warnings.map((w) => (
                  <div
                    key={w.title}
                    className={`rounded-2xl border-l-4 bg-card p-5 shadow-sm ${severityStyles[w.severity]}`}
                  >
                    <p className="font-bold text-sm text-foreground">
                      {w.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {w.detail}
                    </p>
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

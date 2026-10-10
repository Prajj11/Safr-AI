import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getTravelTimes } from "@/lib/goa.functions";
import type { PlaceInsights } from "@/lib/goa-schemas";
import type { Coordinate } from "@/lib/geo";
import { Button } from "@/components/ui/button";

export type SaveExplorePlace = (place: {
  name: string;
  category?: string;
  lat?: number | undefined;
  lng?: number | undefined;
}) => void;
export function NearbyRecommendations({
  data,
  origin,
  onSave,
  isSaved,
}: {
  data: PlaceInsights;
  origin: Coordinate | null;
  onSave: SaveExplorePlace;
  isSaved: (name: string) => boolean;
}) {
  const [sort, setSort] = useState<"nearest" | "road">("nearest");
  const travel = useServerFn(getTravelTimes);
  const items = useMemo(
    () => [...data.eat, ...data.activities, ...data.sights],
    [data],
  );
  const destinations = useMemo(
    () =>
      items.filter(
        (item): item is typeof item & Coordinate =>
          item.lat != null && item.lng != null,
      ),
    [items],
  );
  const start = origin || data.location;
  const times = useQuery({
    queryKey: [
      "explore-road-times",
      start.lat,
      start.lng,
      destinations.map((item) => [item.name, item.lat, item.lng]),
    ],
    queryFn: async () => {
      const batches = [];
      for (let i = 0; i < destinations.length; i += 12)
        batches.push(
          travel({
            data: {
              origin: start,
              destinations: destinations
                .slice(i, i + 12)
                .map((item) => ({ lat: item.lat, lng: item.lng })),
            },
          }),
        );
      return (await Promise.all(batches)).flat();
    },
    enabled: destinations.length > 0,
    staleTime: 300000,
    retry: false,
  });
  const byPlace = new Map(
    destinations.map((item, i) => [
      `${item.name}:${item.lat},${item.lng}`,
      times.data?.[i],
    ]),
  );
  const timeFor = (item: (typeof items)[number]) =>
    byPlace.get(`${item.name}:${item.lat},${item.lng}`);
  const groups = [
    ["Where to eat", data.eat, "food"],
    ["Things to do", data.activities, "activity"],
    ["Sights & landmarks", data.sights, "sight"],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-lg">Nearby places</h3>
        <label className="text-sm">
          Sort{" "}
          <select
            className="rounded-lg border border-border bg-card p-2 ml-1"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value === "road" ? "road" : "nearest")
            }
          >
            <option value="nearest">Nearest</option>
            <option value="road">Quickest by road</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Travel times {origin ? "from you" : `from ${data.location.name}`} ·
        Driving estimates without live traffic.
      </p>
      {times.isError && (
        <div className="text-sm">
          Road times could not be loaded.{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void times.refetch()}
          >
            Retry road times
          </Button>
        </div>
      )}
      {groups.map(
        ([title, entries, category]) =>
          entries.length > 0 && (
            <section
              key={title}
              className="rounded-3xl border border-border bg-card p-6"
            >
              <h4 className="font-semibold mb-3">{title}</h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[...entries]
                  .sort((a, b) =>
                    sort === "road"
                      ? (timeFor(a)?.minutes ?? Infinity) -
                        (timeFor(b)?.minutes ?? Infinity)
                      : (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
                  )
                  .map((item) => (
                    <article
                      key={`${item.name}:${item.lat},${item.lng}`}
                      className="rounded-2xl bg-secondary/30 border border-border p-4 space-y-2"
                    >
                      <h5 className="font-semibold text-sm">{item.name}</h5>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      {item.openingHours && (
                        <p className="text-xs">
                          Listed hours: {item.openingHours}
                        </p>
                      )}
                      {timeFor(item) && (
                        <p className="text-xs font-medium text-primary">
                          about {timeFor(item)!.minutes} min by road ·{" "}
                          {timeFor(item)!.km} km
                        </p>
                      )}
                      <div className="flex gap-3 items-center flex-wrap">
                        {item.lat != null && item.lng != null && (
                          <Link
                            className="text-xs text-primary underline"
                            to="/map"
                            search={{
                              dest: item.name,
                              lat: String(item.lat),
                              lng: String(item.lng),
                            }}
                          >
                            Directions
                          </Link>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onSave({
                              name: item.name,
                              category,
                              lat: item.lat,
                              lng: item.lng,
                            })
                          }
                        >
                          {isSaved(item.name) ? "Saved" : "Add to bucket list"}
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ),
      )}
      <p className="text-xs text-muted-foreground">
        Nearby OpenStreetMap listings may be incomplete or out of date.
        Distances are straight-line unless labelled by road.
      </p>
    </div>
  );
}

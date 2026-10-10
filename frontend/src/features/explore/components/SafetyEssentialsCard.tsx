import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlaceEssentials } from "@/lib/goa.functions";
import { EMERGENCY_NUMBERS } from "@/lib/emergency-contacts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function SafetyEssentialsCard({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const get = useServerFn(getPlaceEssentials);
  const query = useQuery({
    queryKey: ["explore-essentials", lat, lng],
    queryFn: () => get({ data: { lat, lng } }),
    staleTime: 86400000,
    retry: false,
  });
  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-3">
      <h3 className="font-bold text-lg">Safety essentials</h3>
      {query.isPending ? (
        <Skeleton className="h-24" aria-label="Loading nearby essentials" />
      ) : query.isError ? (
        <div>
          <p className="text-sm">Nearby essentials could not be loaded.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry essentials
          </Button>
        </div>
      ) : (
        query.data?.map((item) => (
          <div
            key={item.kind}
            className="flex justify-between gap-3 border-b border-border py-2"
          >
            <div>
              <p className="text-sm font-medium capitalize">
                {item.kind}: {item.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.distanceKm.toFixed(1)} km straight-line
                {item.openingHours
                  ? ` · Listed hours: ${item.openingHours}`
                  : ""}
              </p>
            </div>
            <Link
              className="text-xs text-primary underline shrink-0"
              to="/map"
              search={{
                dest: item.name,
                lat: String(item.lat),
                lng: String(item.lng),
              }}
            >
              Open on Map
            </Link>
          </div>
        ))
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.entries(EMERGENCY_NUMBERS).map(([label, phone]) => (
          <a
            key={label}
            className="capitalize text-primary underline"
            href={`tel:${phone}`}
          >
            {label}: {phone}
          </a>
        ))}
      </div>
    </section>
  );
}

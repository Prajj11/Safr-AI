import { useEffect, useMemo, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getRoadReports, submitRoadReport } from "@/lib/road-reports.functions";
import type { RoadReportInput } from "@/lib/road-reports";

export function RoadReports({
  point,
  onLocate,
  map,
}: {
  point: { lat: number; lng: number; name: string } | null;
  onLocate: (point: { lat: number; lng: number }) => void;
  map: MapLibreMap | null;
}) {
  const get = useServerFn(getRoadReports);
  const submit = useServerFn(submitRoadReport);
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState<RoadReportInput["kind"]>("obstruction");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["road-reports"],
    queryFn: () => get(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (data: RoadReportInput) => submit({ data }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setDetail("");
        void query.refetch();
      } else toast.error(result.message);
    },
    onError: () =>
      toast.error("Unable to submit. Check your connection and try again."),
  });
  const reports = (query.data?.reports ?? []).filter(
    (report) => Date.parse(report.expires_at) > now,
  );
  const features = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: (query.data?.reports ?? [])
        .filter(
          (report) =>
            report.status === "approved" && Date.parse(report.expires_at) > now,
        )
        .map((report) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [report.lng, report.lat] },
          properties: { kind: report.kind },
        })),
    }),
    [query.data, now],
  );
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      if (!map.isStyleLoaded()) return;
      const source = map.getSource("safr-road-reports") as
        GeoJSONSource | undefined;
      if (source) source.setData(features);
      else
        map.addSource("safr-road-reports", { type: "geojson", data: features });
      if (!map.getLayer("safr-road-reports-pins"))
        map.addLayer({
          id: "safr-road-reports-pins",
          type: "circle",
          source: "safr-road-reports",
          paint: {
            "circle-radius": 10,
            "circle-color": "#b45309",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
          },
        });
    };
    const onceReady = () => {
      if (map.isStyleLoaded()) {
        sync();
        map.off("idle", onceReady);
      }
    };
    sync();
    map.on("style.load", sync);
    if (!map.isStyleLoaded()) map.on("idle", onceReady);
    return () => {
      map.off("style.load", sync);
      map.off("idle", onceReady);
      if (map.getLayer("safr-road-reports-pins"))
        map.removeLayer("safr-road-reports-pins");
      if (map.getSource("safr-road-reports"))
        map.removeSource("safr-road-reports");
    };
  }, [map, features]);
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Community road reports
      </summary>
      <p className="mb-3 text-xs text-muted-foreground">
        Reviewed visitor reports, not official alerts. Reports expire after six
        hours and do not automatically change routes. For an emergency, use SOS.
        Approved reports appear as amber circles on the map.
      </p>
      {query.isPending ? (
        <p role="status">Loading reports…</p>
      ) : query.isError || !query.data?.available ? (
        <div>
          <p>Road reports are temporarily unavailable.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {reports.length === 0 && (
            <p>
              No recent reports available. This does not confirm roads are
              clear.
            </p>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {reports.map((report) => (
              <li key={report.id} className="my-3 rounded-lg border p-2">
                <strong className="capitalize">{report.kind}</strong> ·{" "}
                {report.status === "approved"
                  ? "Reviewed community report"
                  : `Your report: ${report.status}`}
                <p>{report.detail}</p>
                <p className="text-xs">
                  Reported {new Date(report.created_at).toLocaleString()} ·
                  expires {new Date(report.expires_at).toLocaleTimeString()}
                </p>
                <Button
                  variant="outline"
                  className="mt-2 min-h-11"
                  onClick={() => onLocate(report)}
                >
                  Show location
                </Button>
              </li>
            ))}
          </ul>
          {point ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({
                  lat: point.lat,
                  lng: point.lng,
                  kind,
                  detail,
                });
              }}
            >
              <p>
                Report at {point.name} ({point.lat.toFixed(5)},{" "}
                {point.lng.toFixed(5)}). Select or adjust a destination pin to
                change this location.
              </p>
              <label className="block">
                Issue
                <select
                  className="block min-h-11 w-full rounded-lg border bg-background px-2"
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value as RoadReportInput["kind"])
                  }
                >
                  {["obstruction", "closure", "flooding", "roadworks"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="block">
                What did you observe?
                <textarea
                  required
                  minLength={10}
                  maxLength={300}
                  className="block w-full rounded-lg border bg-background p-2"
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Describe the road issue. Do not include personal details."
                />
              </label>
              <Button
                disabled={mutation.isPending || detail.trim().length < 10}
                type="submit"
              >
                {mutation.isPending ? "Submitting…" : "Submit for review"}
              </Button>
            </form>
          ) : (
            <p className="mt-3">
              Select a destination to report a road issue at that pin.
            </p>
          )}
        </>
      )}
    </details>
  );
}

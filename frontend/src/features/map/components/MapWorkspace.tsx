import { useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function MapWorkspace({
  children,
  planner,
  summary,
  expanded,
  onExpand,
}: {
  children: ReactNode;
  planner: ReactNode;
  summary: string;
  expanded: boolean;
  onExpand: (value: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const swiped = useRef(false);
  const start = useRef<number | null>(null);
  return (
    <div
      className={`relative isolate h-[calc(100dvh-13rem)] min-h-[380px] lg:min-h-[480px] lg:grid gap-4 ${collapsed ? "lg:grid-cols-1" : "lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]"}`}
    >
      <aside
        className={`absolute bottom-2 left-2 right-2 z-30 rounded-3xl border bg-card/95 shadow-xl backdrop-blur-xl lg:relative lg:inset-auto lg:h-full lg:min-h-0 lg:bg-card lg:shadow-sm flex flex-col ${collapsed ? "lg:hidden" : ""}`}
        aria-label="Trip planner"
      >
        <div className="flex items-center gap-2 p-3 lg:p-4 border-b">
          <button
            type="button"
            className="flex-1 text-left min-w-0 touch-none lg:hidden"
            aria-expanded={expanded}
            aria-controls="map-planner-content"
            onPointerDown={(e) => {
              swiped.current = false;
              start.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const delta = e.clientY - (start.current ?? e.clientY);
              start.current = null;
              if (Math.abs(delta) > 25) {
                swiped.current = true;
                onExpand(delta < 0);
              }
            }}
            onPointerCancel={() => {
              start.current = null;
            }}
            onClick={() => {
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              onExpand(!expanded);
            }}
          >
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-muted-foreground/30 lg:hidden" />
            <span className="flex items-center gap-2 font-bold text-sm">
              <Route className="size-4 text-primary" />
              Your trip
            </span>
            <span
              className="block truncate text-xs text-muted-foreground mt-1"
              aria-live="polite"
            >
              {summary}
            </span>
          </button>
          <div className="hidden lg:block flex-1 min-w-0">
            <h2 className="text-sm font-bold">Your trip</h2>
            <p
              className="text-xs text-muted-foreground truncate mt-1"
              aria-live="polite"
            >
              {summary}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            aria-label={
              expanded ? "Collapse trip planner" : "Expand trip planner"
            }
            onClick={() => onExpand(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex shrink-0"
            aria-label="Collapse trip planner"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
        <div
          id="map-planner-content"
          className={`${expanded ? "flex" : "hidden"} lg:flex flex-col gap-3 p-3 overflow-y-auto overscroll-contain max-h-[60dvh] lg:max-h-none lg:flex-1 min-h-0`}
        >
          {planner}
        </div>
      </aside>
      <div className="h-full min-w-0 relative">
        {children}
        {collapsed && (
          <Button
            className="hidden lg:inline-flex absolute left-4 top-4 z-20 shadow-lg"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="size-4 mr-2" />
            <span className="text-left">
              Plan trip
              <span className="block text-xs font-normal max-w-64 truncate">
                {summary}
              </span>
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

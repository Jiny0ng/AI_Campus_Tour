import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import { campusCenter } from "@/constants/campus";
import type { CampusTourPoint, CampusTourRouteSegment, CampusTourStop } from "@/types";

type TourMapBackgroundProps = {
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  completedSegments?: CampusTourRouteSegment[];
};

function toPolylinePoints(points: CampusTourPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function TourMapBackground({
  currentStop,
  nextStop,
  completedSegments = [],
}: TourMapBackgroundProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={campusCenter} zoom={16} />
      <div className="pointer-events-none absolute inset-0 bg-white/5" />

      {currentStop && (
        <>
          <div className="absolute left-4 right-4 top-[57px] z-10 flex h-[38px] items-center gap-2 rounded-full bg-surface/95 px-4 shadow-card">
            <span className="size-3 rounded-full border-2 border-muted" />
            <span className="truncate text-sm font-bold text-ink">{currentStop.name}</span>
          </div>

          <svg
            viewBox="0 0 390 844"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            preserveAspectRatio="none"
            aria-hidden
          >
            {completedSegments.map((segment) => (
              <polyline
                key={`${segment.fromStopId}-${segment.toStopId}`}
                points={toPolylinePoints(segment.points)}
                fill="none"
                stroke="#0F8A7A"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 12"
              />
            ))}
          </svg>

          <div
            className="pointer-events-none absolute z-20 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary-soft shadow-marker"
            style={{ left: currentStop.mapPoint.x, top: currentStop.mapPoint.y }}
          >
            <span className="size-3 rounded-full bg-primary" />
          </div>
        </>
      )}

      {nextStop ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
          style={{ left: nextStop.mapPoint.x, top: nextStop.mapPoint.y }}
        >
          <div className="grid size-9 place-items-center rounded-full border-4 border-white bg-primary text-white shadow-marker">
            <MapPin size={18} fill="currentColor" />
          </div>
          <div className="absolute left-1/2 top-[42px] -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-bold text-white shadow-card">
            {nextStop.name}
          </div>
        </div>
      ) : null}
    </div>
  );
}

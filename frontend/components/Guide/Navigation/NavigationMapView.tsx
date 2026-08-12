import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import { createRoutePath } from "@/lib/navigation";
import type { GuidePlace } from "@/types";

type NavigationMapViewProps = {
  currentLocationPoint: { x: number; y: number };
  destination: GuidePlace;
};

export function NavigationMapView({ currentLocationPoint, destination }: NavigationMapViewProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={destination.coordinate} zoom={16} />

      <svg
        viewBox="0 0 390 844"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        aria-hidden
      >
        <path
          d={createRoutePath(currentLocationPoint, destination.mapPoint)}
          fill="none"
          stroke="#BFE5DD"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={createRoutePath(currentLocationPoint, destination.mapPoint)}
          fill="none"
          stroke="#0F8A7A"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div
        className="pointer-events-none absolute z-20 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary-soft"
        style={{ left: currentLocationPoint.x, top: currentLocationPoint.y }}
      >
        <span className="size-2.5 rounded-full bg-primary" />
      </div>

      <div
        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
        style={{ left: destination.mapPoint.x, top: destination.mapPoint.y }}
      >
        <div className="grid size-9 place-items-center rounded-full border-[4px] border-primary-soft bg-primary text-white shadow-marker">
          <MapPin size={18} fill="currentColor" />
        </div>
        <div className="absolute left-1/2 top-[38px] -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-xs font-extrabold text-white shadow-floating">
          {destination.name}
        </div>
      </div>
    </div>
  );
}

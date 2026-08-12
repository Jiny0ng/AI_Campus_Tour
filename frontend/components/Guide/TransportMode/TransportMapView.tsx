import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import { createRoutePath } from "@/lib/navigation";
import type { GuidePlace } from "@/types";

type TransportMapViewProps = {
  currentLocationPoint: { x: number; y: number };
  destination: GuidePlace;
};

export function TransportMapView({ currentLocationPoint, destination }: TransportMapViewProps) {
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
          stroke="#0F8A7A"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 10"
        />
      </svg>

      <div
        className="pointer-events-none absolute z-20 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-marker-current/20"
        style={{ left: currentLocationPoint.x, top: currentLocationPoint.y }}
      >
        <span className="size-5 rounded-full border-[4px] border-white bg-marker-current shadow-marker" />
      </div>

      <div
        className="pointer-events-none absolute z-20 grid size-10 -translate-x-1/2 -translate-y-full place-items-center rounded-full border-[3px] border-white bg-marker-campus text-white shadow-marker"
        style={{ left: destination.mapPoint.x, top: destination.mapPoint.y }}
      >
        <MapPin size={20} fill="currentColor" />
      </div>
    </div>
  );
}

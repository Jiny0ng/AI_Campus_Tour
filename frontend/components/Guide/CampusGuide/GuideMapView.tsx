import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import { campusCenter } from "@/constants/campus";
import { cn } from "@/lib/cn";
import type { GuidePlace } from "@/types";

type GuideMapViewProps = {
  currentLocationPoint: { x: number; y: number };
  places: GuidePlace[];
  selectedPlaceId?: string;
  onSelectPlace: (place: GuidePlace) => void;
};

export function GuideMapView({
  currentLocationPoint,
  places,
  selectedPlaceId,
  onSelectPlace,
}: GuideMapViewProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={campusCenter} zoom={16} />

      <div
        className="pointer-events-none absolute z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-marker-current/20"
        style={{ left: currentLocationPoint.x, top: currentLocationPoint.y }}
      >
        <span className="size-4 rounded-full border-[3px] border-white bg-marker-current shadow-marker" />
      </div>

      {places.map((place) => {
        const selected = selectedPlaceId === place.id;

        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place)}
            className={cn(
              "absolute z-20 grid -translate-x-1/2 -translate-y-full place-items-center rounded-full border-[3px] border-white shadow-marker transition",
              selected ? "size-10 bg-marker-campus text-white" : "size-8 bg-primary text-white",
            )}
            style={{ left: place.mapPoint.x, top: place.mapPoint.y }}
            aria-label={place.name}
          >
            <MapPin size={selected ? 20 : 16} fill="currentColor" />
          </button>
        );
      })}
    </div>
  );
}

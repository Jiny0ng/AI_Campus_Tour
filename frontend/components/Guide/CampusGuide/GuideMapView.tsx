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
  const markers = places.map((place) => ({
    coordinate: place.coordinate,
    type: (selectedPlaceId === place.id ? "destination" : "facility") as any,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={campusCenter} zoom={16} markers={markers} />
    </div>
  );
}

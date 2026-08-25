import { NaverMap } from "@/components/Map";
import { campusCenter } from "@/constants/campus";
import type { GuidePlace } from "@/types";

type GuideMapViewProps = {
  places: GuidePlace[];
  selectedPlaceId?: string;
  onSelectPlace: (place: GuidePlace) => void;
  recenterUserLocationToken?: number;
};

export function GuideMapView({
  places,
  selectedPlaceId,
  recenterUserLocationToken = 0,
}: GuideMapViewProps) {
  const markers = places.map((place) => ({
    id: place.id,
    position: place.coordinate,
    type: (selectedPlaceId === place.id ? "destination" : "facility") as any,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap
        center={campusCenter}
        zoom={16}
        markers={markers}
        recenterUserLocationToken={recenterUserLocationToken}
      />
    </div>
  );
}

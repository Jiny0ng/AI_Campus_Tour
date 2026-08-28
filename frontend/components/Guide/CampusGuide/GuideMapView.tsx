import { NaverMap } from "@/components/Map";
import type { CampusCoordinate, GuidePlace } from "@/types";

type GuideMapViewProps = {
  places: GuidePlace[];
  center: CampusCoordinate;
  selectedPlaceId?: string;
  onSelectPlace: (place: GuidePlace) => void;
  recenterUserLocationToken?: number;
};

export function GuideMapView({
  places,
  center,
  selectedPlaceId,
  onSelectPlace,
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
        center={center}
        zoom={16}
        markers={markers}
        onMarkerClick={(markerId) => {
          const place = places.find((item) => item.id === markerId);
          if (place) onSelectPlace(place);
        }}
        recenterUserLocationToken={recenterUserLocationToken}
      />
    </div>
  );
}

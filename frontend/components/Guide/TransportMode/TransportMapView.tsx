import { NaverMap } from "@/components/Map";
import type { GuidePlace } from "@/types";

type TransportMapViewProps = {
  destination: GuidePlace;
  recenterUserLocationToken?: number;
};

export function TransportMapView({
  destination,
  recenterUserLocationToken = 0,
}: TransportMapViewProps) {
  const markers = [{ id: destination.id, position: destination.coordinate, type: "destination" as any }];
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap
        center={destination.coordinate}
        zoom={16}
        markers={markers}
        recenterUserLocationToken={recenterUserLocationToken}
      />
    </div>
  );
}

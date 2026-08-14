import { NaverMap } from "@/components/Map";
import type { GuidePlace } from "@/types";

type NavigationMapViewProps = {
  currentLocationPoint: { x: number; y: number };
  destination: GuidePlace;
};

export function NavigationMapView({
  currentLocationPoint,
  destination,
}: NavigationMapViewProps) {
  const markers = [{ id: destination.id, position: destination.coordinate, type: "destination" as any }];
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={destination.coordinate} zoom={16} markers={markers} />
    </div>
  );
}

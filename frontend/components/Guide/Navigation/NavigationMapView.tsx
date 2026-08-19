import { NaverMap } from "@/components/Map";
import type { CampusCoordinate, DrivingRoute, GuidePlace } from "@/types";

type NavigationMapViewProps = {
  currentLocation: CampusCoordinate;
  destination: GuidePlace;
  drivingRoute?: DrivingRoute | null;
};

export function NavigationMapView({
  currentLocation,
  destination,
  drivingRoute,
}: NavigationMapViewProps) {
  const markers = [
    { id: "current", position: currentLocation, type: "current" as const },
    { id: destination.id, position: destination.coordinate, type: "destination" as const },
  ];
  const routes = drivingRoute
    ? [{
        id: "driving-route",
        path: drivingRoute.path,
        strokeColor: "#2F80ED",
        strokeWeight: 7,
        strokeOpacity: 0.9,
      }]
    : [];

  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={destination.coordinate} zoom={16} markers={markers} routes={routes} />
    </div>
  );
}

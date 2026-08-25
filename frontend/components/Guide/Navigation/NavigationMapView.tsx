import { NaverMap } from "@/components/Map";
import type { CampusCoordinate, DrivingRoute, GuidePlace } from "@/types";

type NavigationMapViewProps = {
  currentLocation: CampusCoordinate;
  destination: GuidePlace;
  drivingRoute?: DrivingRoute | null;
  recenterUserLocationToken?: number;
};

export function NavigationMapView({
  currentLocation,
  destination,
  drivingRoute,
  recenterUserLocationToken = 0,
}: NavigationMapViewProps) {
  const markers = [
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
      <NaverMap
        center={currentLocation}
        zoom={17}
        markers={markers}
        routes={routes}
        showUserLocation
        recenterUserLocationToken={recenterUserLocationToken}
      />
    </div>
  );
}

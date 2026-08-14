import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import type { GuidePlace } from "@/types";
import { createRoutePath } from "@/utils/map";

type TransportMapViewProps = {
  currentLocationPoint: { x: number; y: number };
  destination: GuidePlace;
};

export function TransportMapView({
  currentLocationPoint,
  destination,
}: TransportMapViewProps) {
  const markers = [{ coordinate: destination.coordinate, type: "destination" as any }];
  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap center={destination.coordinate} zoom={16} markers={markers} />
    </div>
  );
}

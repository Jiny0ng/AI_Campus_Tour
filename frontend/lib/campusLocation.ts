import type { CampusCoordinate } from "@/types";
import { distanceMeters } from "@/lib/drivingNavigation";

export const NEW_MAIN_GATE_COORDINATE: CampusCoordinate = {
  lat: 35.841469,
  lng: 127.131761,
};

export const CAMPUS_GPS_RADIUS_METERS = 10_000;

export type CampusLocationResolution = {
  coordinate: CampusCoordinate;
  distanceFromNewMainGateMeters: number;
  substituted: boolean;
};

export function resolveCampusLocation(
  coordinate: CampusCoordinate,
): CampusLocationResolution {
  const distanceFromNewMainGateMeters = distanceMeters(
    coordinate,
    NEW_MAIN_GATE_COORDINATE,
  );
  const substituted = distanceFromNewMainGateMeters >= CAMPUS_GPS_RADIUS_METERS;

  return {
    coordinate: substituted ? { ...NEW_MAIN_GATE_COORDINATE } : coordinate,
    distanceFromNewMainGateMeters,
    substituted,
  };
}

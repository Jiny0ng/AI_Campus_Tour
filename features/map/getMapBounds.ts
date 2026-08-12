import type { CampusCoordinate } from "@/types";

export function getMapBounds(points: CampusCoordinate[]) {
  return points.map((point) => [point.lat, point.lng] as const);
}

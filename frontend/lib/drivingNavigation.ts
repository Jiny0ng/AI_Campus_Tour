import type { CampusCoordinate, DrivingGuide, DrivingRoute } from "@/types";

const EARTH_RADIUS_METERS = 6_371_000;

export type DrivingProgress = {
  distanceFromRouteMeters: number;
  remainingDistanceMeters: number;
  remainingDurationMilliseconds: number;
  nextGuide: DrivingGuide | null;
  distanceToNextGuideMeters: number;
};

export function distanceMeters(first: CampusCoordinate, second: CampusCoordinate) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function projectToSegment(
  point: CampusCoordinate,
  start: CampusCoordinate,
  end: CampusCoordinate,
) {
  const latitudeScale = Math.PI * EARTH_RADIUS_METERS / 180;
  const longitudeScale = latitudeScale * Math.cos(point.lat * Math.PI / 180);
  const startX = (start.lng - point.lng) * longitudeScale;
  const startY = (start.lat - point.lat) * latitudeScale;
  const endX = (end.lng - point.lng) * longitudeScale;
  const endY = (end.lat - point.lat) * latitudeScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / squaredLength));
  const projectedX = startX + deltaX * ratio;
  const projectedY = startY + deltaY * ratio;

  return {
    ratio,
    distanceMeters: Math.hypot(projectedX, projectedY),
  };
}

export function getDrivingProgress(
  route: DrivingRoute,
  location: CampusCoordinate,
): DrivingProgress | null {
  if (route.path.length < 2) return null;

  const cumulative = [0];
  for (let index = 0; index < route.path.length - 1; index += 1) {
    cumulative.push(cumulative[index] + distanceMeters(route.path[index], route.path[index + 1]));
  }

  let nearestDistance = Number.POSITIVE_INFINITY;
  let progressDistance = 0;
  for (let index = 0; index < route.path.length - 1; index += 1) {
    const projection = projectToSegment(location, route.path[index], route.path[index + 1]);
    if (projection.distanceMeters < nearestDistance) {
      nearestDistance = projection.distanceMeters;
      progressDistance = cumulative[index]
        + (cumulative[index + 1] - cumulative[index]) * projection.ratio;
    }
  }

  const routeLength = cumulative[cumulative.length - 1];
  const remainingDistance = Math.max(0, routeLength - progressDistance);
  const nextGuide = route.guides.find((guide) => {
    const guideDistance = cumulative[Math.min(guide.pointIndex, cumulative.length - 1)];
    return guideDistance >= progressDistance - 8;
  }) ?? null;
  const guideProgress = nextGuide
    ? cumulative[Math.min(nextGuide.pointIndex, cumulative.length - 1)]
    : routeLength;

  return {
    distanceFromRouteMeters: nearestDistance,
    remainingDistanceMeters: remainingDistance,
    remainingDurationMilliseconds: routeLength > 0
      ? route.durationMilliseconds * remainingDistance / routeLength
      : 0,
    nextGuide,
    distanceToNextGuideMeters: Math.max(0, guideProgress - progressDistance),
  };
}

export function formatNavigationDistance(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  if (value >= 100) return `${Math.round(value / 10) * 10}m`;
  return `${Math.max(0, Math.round(value / 5) * 5)}m`;
}

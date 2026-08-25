import type { GuideDestination, GuidePlace } from "@/types";

type SearchParamsReader = Pick<URLSearchParams, "get">;

export function destinationToSearchParams(destination: GuidePlace) {
  const params = new URLSearchParams({
    placeId: destination.id,
    name: destination.name,
    description: destination.description,
    category: destination.category,
    lat: String(destination.coordinate.lat),
    lng: String(destination.coordinate.lng),
    distance: String(destination.distanceMeters),
  });
  return params.toString();
}

export function destinationFromSearchParams(
  params: SearchParamsReader,
  fallback: GuidePlace,
): GuidePlace {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.get("placeId") || !Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;

  return {
    id: params.get("placeId")!,
    name: params.get("name") || fallback.name,
    description: params.get("description") || fallback.description,
    category: (params.get("category") as GuidePlace["category"]) || "building",
    distanceMeters: Number(params.get("distance")) || fallback.distanceMeters,
    coordinate: { lat, lng },
    mapPoint: { x: lng, y: lat },
  };
}

export function destinationToPlace(
  destination: GuideDestination,
  distanceMeters: number,
): GuidePlace {
  return {
    id: destination.id,
    name: destination.name,
    description: destination.description,
    category: destination.category,
    distanceMeters: Math.round(distanceMeters),
    coordinate: destination.coordinate,
    mapPoint: { x: destination.coordinate.lng, y: destination.coordinate.lat },
    purposes: destination.purposes,
    matchedPurpose: destination.matchedPurpose,
    facilities: destination.facilities,
    facts: destination.facts,
  };
}

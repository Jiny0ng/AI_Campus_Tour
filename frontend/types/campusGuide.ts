import type { CampusCoordinate } from "./campus";

export type GuidePlaceCategory =
  | "building"
  | "parking"
  | "cafe"
  | "convenience"
  | "cafeteria"
  | "rest";

export type GuidePlace = {
  id: string;
  name: string;
  description: string;
  category: GuidePlaceCategory;
  distanceMeters: number;
  coordinate: CampusCoordinate;
  mapPoint: {
    x: number;
    y: number;
  };
};

export type GuideCategory = {
  id: GuidePlaceCategory;
  label: string;
};

export type CampusGuideData = {
  currentLocation: CampusCoordinate;
  currentLocationPoint: {
    x: number;
    y: number;
  };
  categories: GuideCategory[];
  places: GuidePlace[];
};

export type GuideDestination = {
  id: string;
  name: string;
  description: string;
  category: GuidePlaceCategory;
  labels: string[];
  coordinate: CampusCoordinate;
  distanceMeters?: number;
};

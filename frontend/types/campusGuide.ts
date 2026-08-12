import type { CampusCoordinate } from "./campus";

export type GuidePlaceCategory = "parking" | "cafe" | "convenience" | "cafeteria";

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

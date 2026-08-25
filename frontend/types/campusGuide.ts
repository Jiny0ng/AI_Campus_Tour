import type { CampusCoordinate } from "./campus";

export type GuidePlaceCategory =
  | "building"
  | "parking"
  | "cafe"
  | "convenience"
  | "cafeteria"
  | "rest";

export type GuidePurpose = "study" | "rest" | "convenience" | "convenience_store" | "cafe" | "food" | "parking";

export type GuideFacilityInsight = {
  id: string;
  name: string;
  type: string;
  floor: string;
  features: string;
  note: string;
  purposes: GuidePurpose[];
};

export type GuideFactInsight = {
  id: string;
  category: string;
  content: string;
  importance: number;
  verified: boolean;
  purposes: GuidePurpose[];
};

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
  purposes?: GuidePurpose[];
  matchedPurpose?: GuidePurpose | null;
  facilities?: GuideFacilityInsight[];
  facts?: GuideFactInsight[];
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
  purposes?: GuidePurpose[];
  matchedPurpose?: GuidePurpose | null;
  facilities?: GuideFacilityInsight[];
  facts?: GuideFactInsight[];
};

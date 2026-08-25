export type CampusTourPoint = {
  x: number;
  y: number;
};

export type CampusTourTag = {
  label: string;
  value: string;
};

export type CampusTourFact = {
  factId: string;
  category: string;
  content: string;
  importance: number;
  verified: boolean;
  sourceUrl?: string;
  selection?: "required" | "optional";
};

export type CampusTourDocentContext = {
  entityId: string;
  label: string;
  description: string;
  enabled: boolean;
  openingLine?: string;
  targetDurationSeconds: number;
  requiredFacts: CampusTourFact[];
  optionalFacts: CampusTourFact[];
  usesDefaultRule: boolean;
};

export type CampusTourStop = {
  id: string;
  name: string;
  description: string;
  overview?: string;
  insights?: CampusTourFact[];
  docentText?: string;
  docentContext?: CampusTourDocentContext;
  tags: CampusTourTag[];
  studentTip: string[];
  nextStopId?: string;
  walkingMinutesToNext?: number;
  mapPoint: CampusTourPoint;
};

export type CampusTourRouteSegment = {
  fromStopId: string;
  toStopId: string;
  points: CampusTourPoint[];
};

export type CampusTourData = {
  courseTitle: string;
  stops: CampusTourStop[];
  routeSegments: CampusTourRouteSegment[];
};

export type CampusTourNearbySpot = {
  id: string;
  name: string;
  category: string;
  description: string;
  docentText: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  walkingSeconds?: number;
  nearMethod?: "walking_network" | "straight_line_fallback" | "manual";
  nearVerified?: boolean;
};

export type CampusTourSegmentInfo = {
  pois: Array<{ name: string; category: string }>;
  tips: Array<{
    name: string;
    icon: string;
    category: string;
    tip: string;
  }>;
  nearbySpots: CampusTourNearbySpot[];
};

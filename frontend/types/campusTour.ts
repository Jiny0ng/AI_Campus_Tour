export type CampusTourPoint = {
  x: number;
  y: number;
};

export type CampusTourTag = {
  label: string;
  value: string;
};

export type CampusTourStop = {
  id: string;
  name: string;
  description: string;
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

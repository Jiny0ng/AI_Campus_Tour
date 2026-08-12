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

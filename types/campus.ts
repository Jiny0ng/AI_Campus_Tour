export type CampusCoordinate = {
  lat: number;
  lng: number;
};

export type Building = {
  id: string;
  name: string;
  description: string;
  coordinate: CampusCoordinate;
  categories: string[];
};

export type Facility = {
  id: string;
  name: string;
  category: string;
  buildingId: string;
  floor?: string;
};

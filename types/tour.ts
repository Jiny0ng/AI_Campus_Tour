export type TourAudience = "freshman" | "international" | "visitor";

export type TourStop = {
  id: string;
  buildingId: string;
  title: string;
  aiNarration: string;
};

export type TourCourse = {
  id: string;
  title: string;
  description: string;
  audience: TourAudience;
  durationMinutes: number;
  stops: TourStop[];
};

export type TourSummaryTip = {
  id: string;
  title: string;
  description: string;
  icon: "lightbulb" | "bus" | "book";
};

export type TourSummaryData = {
  title: string;
  visitedPlaces: string[];
  tips: TourSummaryTip[];
};

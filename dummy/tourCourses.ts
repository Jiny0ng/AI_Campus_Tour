import type { TourCourse } from "@/types";

export const tourCourses: TourCourse[] = [
  {
    id: "common-orientation",
    title: "Common Orientation Course",
    description: "A short introduction to major campus buildings and student life.",
    audience: "freshman",
    durationMinutes: 35,
    stops: [
      {
        id: "stop-main-hall",
        buildingId: "main-hall",
        title: "Start at Main Hall",
        aiNarration: "This is where many campus services begin.",
      },
      {
        id: "stop-library",
        buildingId: "library",
        title: "Central Library",
        aiNarration: "The library is a core study and community space.",
      },
    ],
  },
  {
    id: "international-student",
    title: "International Student Course",
    description: "A route focused on support centers and everyday campus services.",
    audience: "international",
    durationMinutes: 45,
    stops: [],
  },
];

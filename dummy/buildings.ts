import type { Building } from "@/types";

export const buildings: Building[] = [
  {
    id: "main-hall",
    name: "Main Hall",
    description: "Administrative services, admissions, and visitor information.",
    coordinate: { lat: 37.5665, lng: 126.978 },
    categories: ["administration", "visitor"],
  },
  {
    id: "library",
    name: "Central Library",
    description: "Study rooms, book collections, and digital learning spaces.",
    coordinate: { lat: 37.5672, lng: 126.9774 },
    categories: ["study", "facility"],
  },
];

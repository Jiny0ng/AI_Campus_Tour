import type { LucideIcon } from "lucide-react";
import type { CampusCoordinate } from "./campus";

export type AppRoute = {
  label: string;
  href: string;
};

export type GuideMenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type DrivingRoute = {
  path: CampusCoordinate[];
  guides: DrivingGuide[];
  distanceMeters: number;
  durationMilliseconds: number;
  routeStart: CampusCoordinate | null;
  routeGoal: CampusCoordinate | null;
  routeOption: string;
  generatedAt: string | null;
};

export type DrivingGuide = {
  pointIndex: number;
  type: number;
  instruction: string;
  distanceMeters: number;
  durationMilliseconds: number;
  coordinate: CampusCoordinate | null;
};

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
  distanceMeters: number;
  durationMilliseconds: number;
};

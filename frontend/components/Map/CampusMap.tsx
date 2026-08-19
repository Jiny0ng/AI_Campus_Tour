import { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { campusCenter } from "@/constants/campus";
import type { CampusCoordinate } from "@/types";
import type { NaverMapMarker, NaverMapRoute } from "@/types/naver-map";
import { NaverMap } from "./NaverMap";

type CampusMapProps = {
  center?: CampusCoordinate;
  zoom?: number;
  markers?: NaverMapMarker[];
  routes?: NaverMapRoute[];
  className?: string;
  children?: ReactNode;
};

export function CampusMap({
  center = campusCenter,
  zoom = 18,
  markers = [],
  routes = [],
  className,
  children,
}: CampusMapProps) {
  return (
    <div className={cn("relative min-h-dvh overflow-hidden bg-map", className)}>
      <NaverMap center={center} zoom={zoom} markers={markers} routes={routes} />
      {children ? <div className="absolute inset-0 z-10 pointer-events-none">{children}</div> : null}
    </div>
  );
}

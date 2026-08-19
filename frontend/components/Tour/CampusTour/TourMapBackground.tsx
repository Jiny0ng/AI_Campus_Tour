"use client";

import { MapPin } from "lucide-react";
import { NaverMap } from "@/components/Map";
import type { CampusCoordinate } from "@/types";
import type { CampusTourRouteSegment, CampusTourStop } from "@/types";

type TourMapBackgroundProps = {
  center: CampusCoordinate;
  initialZoom?: number;
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  remainingSegments?: CampusTourRouteSegment[];
  isLoading?: boolean;
  onMapReady?: (map: naver.maps.Map) => void;
};

export function TourMapBackground({
  center,
  initialZoom = 18,
  currentStop,
  nextStop,
  remainingSegments = [],
  isLoading = false,
  onMapReady,
}: TourMapBackgroundProps) {

  // 화면 하단 바텀시트를 고려하여 지도의 시각적 중심이 상단 1/3 지점에 오도록
  // 실제 지도 중심(카메라)을 남쪽으로 살짝 이동시킵니다.
  // zoom 18일때 약 30m(0.0003도), zoom 15일때 약 200m(0.0018도)
  const offsetAmount = initialZoom >= 18 ? 0.0003 : 0.0018;
  const shiftedCenter = { lat: center.lat - offsetAmount, lng: center.lng };

  // 남은 경로 segments를 평탄화하여 렌더링 시 끊김 방지 (접근 경로 vs 본 경로)
  const approachPoints: { lat: number; lng: number }[] = [];
  const mainPoints: { lat: number; lng: number }[] = [];

  remainingSegments.forEach((segment) => {
    const isApproach = segment.fromStopId === "current_location";
    const mappedPoints = segment.points.map((p) => ({ lat: p.y, lng: p.x }));
    if (isApproach) {
      approachPoints.push(...mappedPoints);
    } else {
      mainPoints.push(...mappedPoints);
    }
  });

  const routes = [];
  if (approachPoints.length > 0) {
    routes.push({
      id: "route-approach",
      path: approachPoints,
      strokeColor: "#9CA3AF", // 회색
      strokeWeight: 6,
      strokeOpacity: 0.8,
    });
  }
  if (mainPoints.length > 0) {
    routes.push({
      id: "route-main",
      path: mainPoints,
      strokeColor: "#0F8A7A", // 테마색
      strokeWeight: 6,
      strokeOpacity: 0.95,
    });
  }

  // 현재/다음 정류장 마커
  const markers = [];
  if (currentStop) {
    markers.push({
      id: `marker-${currentStop.id}`,
      title: currentStop.name,
      position: { lat: currentStop.mapPoint.y, lng: currentStop.mapPoint.x },
      type: "current" as const,
    });
  }
  if (nextStop) {
    markers.push({
      id: `marker-${nextStop.id}`,
      title: nextStop.name,
      position: { lat: nextStop.mapPoint.y, lng: nextStop.mapPoint.x },
      type: "destination" as const,
    });
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-map">
      <NaverMap
        center={shiftedCenter}
        zoom={initialZoom}
        routes={routes}
        markers={markers}
        showUserLocation
        followUserLocation={false}
        onReady={onMapReady}
      />
      <div className="pointer-events-none absolute inset-0 bg-white/5" />

      {/* 로딩 중 배너 */}
      {isLoading && (
        <div className="absolute left-4 right-4 top-[57px] z-10 flex h-[38px] animate-pulse items-center gap-2 rounded-full bg-surface/95 px-4 shadow-card">
          <span className="h-3 w-3 rounded-full bg-muted" />
          <span className="h-3 w-36 rounded-full bg-muted/50" />
        </div>
      )}
    </div>
  );
}

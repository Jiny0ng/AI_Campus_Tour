"use client";

import type { CampusTourStop } from "@/types";
import { useAppSettings } from "@/contexts/AppSettingsContext";

type TourStopIndicatorProps = {
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  isLoading?: boolean;
  remainingDistanceMeters?: number | null;
  hasArrived?: boolean;
};

export function TourStopIndicator({
  currentStop,
  nextStop,
  isLoading = false,
  remainingDistanceMeters,
  hasArrived = false,
}: TourStopIndicatorProps) {
  const { t } = useAppSettings();

  if (isLoading) {
    return (
      <div className="flex h-[68px] items-center justify-center rounded-[24px] bg-surface/95 px-4 shadow-card backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-10 animate-pulse rounded-full bg-muted/50" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-muted/30" />
          <span className="h-2.5 w-14 animate-pulse rounded-full bg-primary/30" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-muted/30" />
          <span className="h-2 w-10 animate-pulse rounded-full bg-muted/50" />
        </div>
      </div>
    );
  }

  if (!currentStop) return null;

  return (
    <div
      className="relative flex h-[68px] items-stretch rounded-[24px] bg-surface/95 px-3 shadow-card backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="absolute left-1/4 right-1/4 top-4 h-0.5 -translate-y-1/2 bg-gradient-to-r from-primary to-muted/60" />

      <span className={`absolute left-1/2 top-[25px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold shadow-sm ${hasArrived ? "bg-primary text-white" : "bg-surface text-muted"}`}>
        {hasArrived
          ? t("tour.arrived")
          : remainingDistanceMeters !== null && remainingDistanceMeters !== undefined
            ? `${t("tour.remaining")} ${remainingDistanceMeters >= 1000 ? `${(remainingDistanceMeters / 1000).toFixed(1)}km` : `${remainingDistanceMeters}m`}`
            : t("tour.remaining")}
      </span>

      <div className="relative flex min-w-0 flex-1 flex-col items-center pt-[9px] pr-2">
        <div className="relative flex shrink-0 items-center justify-center">
          <div className="absolute size-5 animate-ping rounded-full bg-primary/20" />
          <div className="relative size-3.5 rounded-full border-2 border-primary bg-primary shadow-sm" />
        </div>
        <span className="mt-6 max-w-full truncate text-sm font-extrabold leading-5 text-primary" title={currentStop.name}>
          {currentStop.name}
        </span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col items-center pt-2.5 pl-2">
        <div className="size-3 shrink-0 rounded-full border-2 border-muted bg-surface" />
        <span
          className="mt-6 max-w-full truncate text-sm font-bold leading-5 text-muted"
          title={nextStop?.name ?? "종점"}
        >
          {nextStop?.name ?? "종점"}
        </span>
      </div>
    </div>
  );
}

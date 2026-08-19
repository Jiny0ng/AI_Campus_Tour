"use client";

import type { CampusTourStop } from "@/types";

type TourStopIndicatorProps = {
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  isLoading?: boolean;
};

export function TourStopIndicator({
  currentStop,
  nextStop,
  isLoading = false,
}: TourStopIndicatorProps) {
  if (isLoading) {
    return (
      <div className="flex h-[38px] items-center justify-center rounded-full bg-surface/95 px-4 shadow-card backdrop-blur-sm">
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
    <div className="relative flex h-[38px] items-stretch rounded-full bg-surface/95 px-3 shadow-card backdrop-blur-sm">
      <div className="absolute left-1/4 right-1/4 top-[11px] h-0.5 -translate-y-1/2 bg-gradient-to-r from-primary to-muted/60" />

      <div className="relative flex min-w-0 flex-1 flex-col items-center pt-[5px] pr-2">
        <div className="relative flex shrink-0 items-center justify-center">
          <div className="absolute size-5 animate-ping rounded-full bg-primary/20" />
          <div className="relative size-3.5 rounded-full border-2 border-primary bg-primary shadow-sm" />
        </div>
        <span className="mt-0.5 max-w-full truncate text-[9px] font-bold leading-3 text-primary" title={currentStop.name}>
          {currentStop.name}
        </span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col items-center pt-[6px] pl-2">
        <div className="size-3 shrink-0 rounded-full border-2 border-muted bg-surface" />
        <span
          className="mt-0.5 max-w-full truncate text-[9px] font-semibold leading-3 text-muted"
          title={nextStop?.name ?? "종점"}
        >
          {nextStop?.name ?? "종점"}
        </span>
      </div>
    </div>
  );
}

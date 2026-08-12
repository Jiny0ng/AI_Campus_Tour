"use client";

import { Bus, Car, Footprints, Navigation } from "lucide-react";
import { Button } from "@/components/Common";
import type { TransportModeValue } from "@/lib/navigation";
import type { GuidePlace } from "@/types";

type NavigationStatusPanelProps = {
  destination: GuidePlace;
  modeLabel: string;
  mode: TransportModeValue;
  minutes: number;
  remainingDistance: string;
  arrivalTime: string;
  onChangeRoute: () => void;
  onEnd: () => void;
};

export function NavigationStatusPanel({
  destination,
  modeLabel,
  mode,
  minutes,
  remainingDistance,
  arrivalTime,
  onChangeRoute,
  onEnd,
}: NavigationStatusPanelProps) {
  const ModeIcon = mode === "car" ? Car : mode === "shuttle" ? Bus : Footprints;

  return (
    <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] bg-surface pb-[calc(36px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
      <div className="px-4">
        <div className="flex min-h-[64px] max-w-[268px] items-center gap-3 rounded-card bg-surface px-3 py-3 shadow-floating">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-white">
            <Navigation size={20} />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-ink">직진 후 우회전</h2>
            <p className="mt-0.5 text-xs font-medium text-muted">120m 앞</p>
          </div>
        </div>

        <div className="mt-7 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-white">
            <ModeIcon size={21} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold text-ink">
              {destination.name}까지 {modeLabel} {minutes}분
            </h3>
            <p className="mt-1 text-sm font-medium text-muted">
              {remainingDistance} · <span className="font-extrabold text-primary">도착 {arrivalTime}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 border-t border-line px-4 pt-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 rounded-card text-base"
          onClick={onChangeRoute}
        >
          경로 변경
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12 rounded-card text-base"
          onClick={onEnd}
        >
          안내 종료
        </Button>
      </div>
    </section>
  );
}

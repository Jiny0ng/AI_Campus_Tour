"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import type { CampusTourData } from "@/types";
import { AiTourSheet } from "./AiTourSheet";
import { TourMapBackground } from "./TourMapBackground";

type CampusTourScreenProps = {
  data: CampusTourData;
};

export function CampusTourScreen({ data }: CampusTourScreenProps) {
  const router = useRouter();
  const [currentStopIndex, setCurrentStopIndex] = useState(0);

  const currentStop = data?.stops?.[currentStopIndex];
  const nextStop = currentStop?.nextStopId
    ? data.stops.find((stop) => stop.id === currentStop.nextStopId)
    : undefined;
  const isLastStop = data?.stops?.length > 0 && currentStopIndex === data.stops.length - 1;

  const completedSegments = useMemo(() => {
    if (!data?.routeSegments || data.routeSegments.length === 0) return [];
    const visibleStopIds = new Set(data.stops.slice(0, currentStopIndex + 2).map((stop) => stop.id));

    return data.routeSegments.filter(
      (segment) => visibleStopIds.has(segment.fromStopId) && visibleStopIds.has(segment.toStopId),
    );
  }, [currentStopIndex, data?.routeSegments, data?.stops]);

  function handleNext() {
    if (isLastStop) {
      router.push(APP_ROUTES.tourSummary);
      return;
    }
    if (data?.stops?.length > 0) {
      setCurrentStopIndex((index) => Math.min(index + 1, data.stops.length - 1));
    }
  }

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <TourMapBackground
          currentStop={currentStop}
          nextStop={nextStop}
          completedSegments={completedSegments}
        />
        <AiTourSheet
          currentStop={currentStop}
          nextStop={nextStop}
          isLastStop={isLastStop}
          onNext={handleNext}
        />
      </main>
    </MobileShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";
import { MobileShell } from "@/components/Layout";
import { campusCenter } from "@/constants/campus";
import { APP_ROUTES } from "@/constants/routes";
import type {
  CampusTourData,
  CampusTourNearbySpot,
  CampusTourRouteSegment,
  CampusTourStop,
} from "@/types";
import { AiTourSheet } from "./AiTourSheet";
import { TourMapBackground } from "./TourMapBackground";
import { TourStopIndicator } from "./TourStopIndicator";

type CampusTourScreenProps = {
  data: CampusTourData;
};

export function CampusTourScreen({ data }: CampusTourScreenProps) {
  const router = useRouter();
  const [tourData, setTourData] = useState(data);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbySpots, setNearbySpots] = useState<CampusTourNearbySpot[]>([]);
  const [isNearbyLoading, setIsNearbyLoading] = useState(true);
  const [addingSpotId, setAddingSpotId] = useState<string | null>(null);

  const currentStop = tourData?.stops?.[currentStopIndex];
  const nextStop = currentStop?.nextStopId
    ? tourData.stops.find((stop) => stop.id === currentStop.nextStopId)
    : undefined;
  const isLastStop = tourData?.stops?.length > 0 && currentStopIndex === tourData.stops.length - 1;

  const currentSegment = useMemo(() => {
    if (!currentStop || !nextStop) return [];
    return tourData.routeSegments.filter(
      (segment) =>
        segment.fromStopId === currentStop.id && segment.toStopId === nextStop.id,
    );
  }, [currentStop, nextStop, tourData.routeSegments]);

  const mapCenter = currentStop
    ? { lat: currentStop.mapPoint.y, lng: currentStop.mapPoint.x }
    : campusCenter;

  useEffect(() => {
    if (!navigator.geolocation) {
      setIsNearbyLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => setIsNearbyLoading(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!userLocation) return;

    const controller = new AbortController();
    setIsNearbyLoading(true);

    fetch("/api/tour/nearby-spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: userLocation.lat,
        longitude: userLocation.lng,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Nearby spots request failed");
        return response.json();
      })
      .then((result: { nearbySpots: CampusTourNearbySpot[] }) => {
        setNearbySpots(result.nearbySpots);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setNearbySpots([]);
      })
      .finally(() => setIsNearbyLoading(false));

    return () => controller.abort();
  }, [userLocation]);

  async function handleAddWaypoint(spot: CampusTourNearbySpot) {
    if (!userLocation || !currentStop || !nextStop || addingSpotId) return;

    setAddingSpotId(spot.id);
    try {
      const response = await fetch("/api/tour/waypoint-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_lat: userLocation.lat,
          current_lng: userLocation.lng,
          spot_id: spot.id,
          spot_name: spot.name,
          spot_lat: spot.latitude,
          spot_lng: spot.longitude,
          next_stop_id: nextStop.id,
          next_lat: nextStop.mapPoint.y,
          next_lng: nextStop.mapPoint.x,
        }),
      });
      if (!response.ok) throw new Error("Waypoint route request failed");

      const result = (await response.json()) as {
        stop: CampusTourStop;
        segments: CampusTourRouteSegment[];
      };

      setTourData((previous) => {
        if (previous.stops.some((stop) => stop.id === spot.id)) return previous;

        const stops = [...previous.stops];
        stops[currentStopIndex] = { ...currentStop, nextStopId: spot.id };
        stops.splice(currentStopIndex + 1, 0, result.stop);

        const segmentIndex = previous.routeSegments.findIndex(
          (segment) =>
            segment.fromStopId === currentStop.id && segment.toStopId === nextStop.id,
        );
        const insertedSegments = [
          { ...result.segments[0], fromStopId: currentStop.id },
          result.segments[1],
        ];
        const routeSegments = [...previous.routeSegments];
        if (segmentIndex >= 0) {
          routeSegments.splice(segmentIndex, 1, ...insertedSegments);
        } else {
          routeSegments.push(...insertedSegments);
        }

        return { ...previous, stops, routeSegments };
      });
    } finally {
      setAddingSpotId(null);
    }
  }

  function handleNext() {
    if (isLastStop) {
      router.push(APP_ROUTES.tourSummary);
      return;
    }
    if (tourData?.stops?.length > 0) {
      setCurrentStopIndex((index) => Math.min(index + 1, tourData.stops.length - 1));
    }
  }

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <TourMapBackground
          center={mapCenter}
          currentStop={currentStop}
          nextStop={nextStop}
          remainingSegments={currentSegment}
        />
        <div className="absolute inset-x-4 top-[57px] z-20">
          <div className="flex items-start gap-2">
            <button
              type="button"
              aria-label="뒤로가기"
              className="grid size-[38px] shrink-0 place-items-center rounded-full bg-surface/95 text-ink shadow-card backdrop-blur-sm"
              onClick={() => router.back()}
            >
              <ChevronLeft size={22} />
            </button>
            <div className="min-w-0 flex-1">
              <TourStopIndicator
                currentStop={currentStop}
                nextStop={nextStop}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              aria-label={isMuted ? "음소거 해제" : "음소거"}
              aria-pressed={isMuted}
              className="grid size-[38px] place-items-center rounded-full bg-surface/95 text-ink shadow-card backdrop-blur-sm"
              onClick={() => setIsMuted((muted) => !muted)}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>
        </div>
        <AiTourSheet
          currentStop={currentStop}
          nextStop={nextStop}
          isLastStop={isLastStop}
          onNext={handleNext}
          nearbySpots={nearbySpots.filter(
            (spot) => !tourData.stops.some((stop) => stop.id === spot.id),
          )}
          isNearbyLoading={isNearbyLoading}
          addingSpotId={addingSpotId}
          onAddWaypoint={handleAddWaypoint}
        />
      </main>
    </MobileShell>
  );
}

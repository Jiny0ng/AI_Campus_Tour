"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { getArrivalTime, getRouteSummary, TransportModeValue } from "@/lib/navigation";
import type { CampusGuideData, DrivingRoute, GuidePlaceCategory } from "@/types";
import { GuideCategoryBar } from "../CampusGuide/GuideCategoryBar";
import { NavigationMapView } from "./NavigationMapView";
import { NavigationStatusPanel } from "./NavigationStatusPanel";

type NavigationScreenProps = {
  data: CampusGuideData;
};

function normalizeMode(value: string | null): TransportModeValue {
  if (value === "car" || value === "shuttle") {
    return value;
  }

  return "walk";
}

export function NavigationScreen({ data }: NavigationScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const placeId = searchParams.get("placeId");
  const mode = normalizeMode(searchParams.get("mode"));
  const destination = data.places.find((place) => place.id === placeId) ?? data.places[0];
  const fallbackSummary = getRouteSummary(destination, mode);
  const [selectedCategory, setSelectedCategory] = useState<GuidePlaceCategory>(destination.category);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "car") {
      setDrivingRoute(null);
      setRouteError(null);
      return;
    }

    const controller = new AbortController();
    setRouteError(null);

    fetch("/api/directions/driving", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: data.currentLocation,
        goal: destination.coordinate,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Directions request failed");
        return response.json();
      })
      .then((route: DrivingRoute) => setDrivingRoute(route))
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setRouteError("자동차 경로를 불러오지 못했습니다.");
        }
      });

    return () => controller.abort();
  }, [data.currentLocation, destination.coordinate, mode]);

  const drivingMinutes = drivingRoute
    ? Math.max(1, Math.ceil(drivingRoute.durationMilliseconds / 60000))
    : fallbackSummary.minutes;
  const summary = drivingRoute
    ? {
        minutes: drivingMinutes,
        modeLabel: "차량",
        arrivalTime: getArrivalTime(drivingMinutes),
        remainingDistance:
          drivingRoute.distanceMeters >= 1000
            ? `${(drivingRoute.distanceMeters / 1000).toFixed(1)}km 남음`
            : `${drivingRoute.distanceMeters}m 남음`,
      }
    : fallbackSummary;

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <NavigationMapView
          currentLocation={data.currentLocation}
          destination={destination}
          drivingRoute={drivingRoute}
        />

        <div className="pointer-events-auto absolute left-4 right-4 top-[57px] z-30">
          <SearchBar
            value={destination.name}
            readOnly
            placeholder="건물, 시설, 편의점 검색..."
            containerClassName="h-[38px] bg-surface/95"
          />
          <div className="mt-3">
            <GuideCategoryBar
              categories={data.categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>
        </div>

        {routeError ? (
          <div className="absolute left-4 right-4 top-[150px] z-30 rounded-card bg-surface/95 px-3 py-2 text-center text-xs font-bold text-red-600 shadow-card">
            {routeError}
          </div>
        ) : null}

        <NavigationStatusPanel
          destination={destination}
          mode={mode}
          modeLabel={summary.modeLabel}
          minutes={summary.minutes}
          remainingDistance={summary.remainingDistance}
          arrivalTime={summary.arrivalTime}
          onChangeRoute={() => router.push(APP_ROUTES.guide)}
          onEnd={() => router.push(APP_ROUTES.home)}
        />
      </main>
    </MobileShell>
  );
}

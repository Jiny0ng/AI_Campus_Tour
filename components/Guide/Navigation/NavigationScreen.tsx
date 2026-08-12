"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { getRouteSummary, TransportModeValue } from "@/lib/navigation";
import type { CampusGuideData, GuidePlaceCategory } from "@/types";
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
  const summary = getRouteSummary(destination, mode);
  const [selectedCategory, setSelectedCategory] = useState<GuidePlaceCategory>(destination.category);

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <NavigationMapView
          currentLocationPoint={data.currentLocationPoint}
          destination={destination}
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

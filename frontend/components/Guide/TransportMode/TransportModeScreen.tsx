"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, LocateFixed } from "lucide-react";
import { FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { getTransportMinutes } from "@/lib/navigation";
import type { CampusGuideData, GuidePlaceCategory } from "@/types";
import { GuideCategoryBar } from "../CampusGuide/GuideCategoryBar";
import { TransportMapView } from "./TransportMapView";
import { TransportModeSheet } from "./TransportModeSheet";
import type { TransportMode, TransportOption } from "./TransportOptionGroup";

type TransportModeScreenProps = {
  data: CampusGuideData;
};

function createTransportOptions(distanceMeters: number): TransportOption[] {
  return [
    { id: "walk", label: "도보 (걷기)", minutes: getTransportMinutes(distanceMeters, "walk") },
    { id: "car", label: "차량", minutes: getTransportMinutes(distanceMeters, "car") },
    { id: "shuttle", label: "순환버스", minutes: getTransportMinutes(distanceMeters, "shuttle") },
  ];
}

export function TransportModeScreen({ data }: TransportModeScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const placeId = searchParams.get("placeId");
  const destination = data.places.find((place) => place.id === placeId) ?? data.places[0];
  const [selectedCategory, setSelectedCategory] = useState<GuidePlaceCategory>(destination.category);
  const [selectedMode, setSelectedMode] = useState<TransportMode>("walk");

  const options = useMemo(
    () => createTransportOptions(destination.distanceMeters),
    [destination.distanceMeters],
  );

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <TransportMapView
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

        <div className="pointer-events-auto absolute right-4 top-[188px] z-20 flex flex-col gap-3">
          <FloatingButton icon={<Compass size={21} />} label="지도 방향" />
          <FloatingButton
            icon={<LocateFixed size={21} />}
            label="현재 위치"
            onClick={() => window.dispatchEvent(new Event("campus-map-request-orientation"))}
          />
        </div>

        <div className="pointer-events-none absolute left-1/2 top-[320px] z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-floating">
          {destination.name}
        </div>

        <TransportModeSheet
          destination={destination}
          options={options}
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          onStart={() => {
            router.push(`/guide/navigation?placeId=${destination.id}&mode=${selectedMode}`);
          }}
        />
      </main>
    </MobileShell>
  );
}

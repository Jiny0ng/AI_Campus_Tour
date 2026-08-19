"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import type { CampusGuideData, GuidePlace, GuidePlaceCategory } from "@/types";
import { GuideCategoryBar } from "./GuideCategoryBar";
import { GuideMapView } from "./GuideMapView";
import { GuideSearchResults } from "./GuideSearchResults";
import { NearbyFacilitySheet } from "./NearbyFacilitySheet";

type CampusGuideScreenProps = {
  data: CampusGuideData;
};

export function CampusGuideScreen({ data }: CampusGuideScreenProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<GuidePlaceCategory>("parking");
  const [selectedPlace, setSelectedPlace] = useState<GuidePlace | null>(null);

  const categoryPlaces = useMemo(
    () => data.places.filter((place) => place.category === selectedCategory),
    [data.places, selectedCategory],
  );

  const visiblePlaces = useMemo(() => {
    if (!selectedPlace || categoryPlaces.some((place) => place.id === selectedPlace.id)) {
      return categoryPlaces;
    }

    return [...categoryPlaces, selectedPlace];
  }, [categoryPlaces, selectedPlace]);

  const nearbyPlaces = useMemo(
    () =>
      data.places
        .filter((place) => place.distanceMeters <= 300)
        .slice()
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 3),
    [data.places],
  );

  const searchResults = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return data.places.filter((place) =>
      [place.name, place.description].some((value) => value.toLowerCase().includes(query)),
    );
  }, [data.places, keyword]);

  function handleSelectPlace(place: GuidePlace) {
    setSelectedPlace(place);
    setKeyword("");
    router.push(`/guide/transport?placeId=${place.id}`);
  }

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <GuideMapView
          currentLocationPoint={data.currentLocationPoint}
          places={visiblePlaces}
          selectedPlaceId={selectedPlace?.id}
          onSelectPlace={handleSelectPlace}
        />

        <div className="pointer-events-auto absolute left-4 right-4 top-[57px] z-30">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="grid size-[38px] shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card"
              aria-label="뒤로가기"
            >
              <ChevronLeft size={24} />
            </button>
            <SearchBar
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="건물, 시설, 편의점 검색..."
              containerClassName="h-[38px] flex-1 bg-surface/95"
            />
          </div>
          <GuideSearchResults places={searchResults} onSelectPlace={handleSelectPlace} />
          <div className="mt-3">
            <GuideCategoryBar
              categories={data.categories}
              selectedCategory={selectedCategory}
              onSelectCategory={(category) => {
                setSelectedCategory(category);
                setSelectedPlace(null);
              }}
            />
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-[181px] z-20 flex flex-col gap-3">
          <FloatingButton icon={<Compass size={21} />} label="지도 방향" />
          <FloatingButton
            icon={<LocateFixed size={21} />}
            label="현재 위치"
            variant="soft"
            onClick={() => window.dispatchEvent(new Event("campus-map-request-orientation"))}
          />
        </div>

        {selectedPlace ? (
          <div className="pointer-events-none absolute left-1/2 top-[360px] z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-floating">
            {selectedPlace.name}
          </div>
        ) : null}

        <NearbyFacilitySheet places={nearbyPlaces} onSelectPlace={handleSelectPlace} />
      </main>
    </MobileShell>
  );
}

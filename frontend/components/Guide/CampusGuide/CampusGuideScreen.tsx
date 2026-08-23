"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { distanceMeters } from "@/lib/drivingNavigation";
import { destinationToPlace, destinationToSearchParams } from "@/lib/guideDestination";
import { trackedFetch } from "@/lib/networkFetch";
import type { CampusCoordinate, CampusGuideData, GuideDestination, GuidePlace } from "@/types";
import { GuideMapView } from "./GuideMapView";
import { GuideSearchResults } from "./GuideSearchResults";
import { NearbyFacilitySheet } from "./NearbyFacilitySheet";

type CampusGuideScreenProps = {
  data: CampusGuideData;
};

export function CampusGuideScreen({ data }: CampusGuideScreenProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<GuidePlace | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CampusCoordinate>(data.currentLocation);
  const [popularDestinations, setPopularDestinations] = useState<GuideDestination[]>([]);
  const [matchedDestinations, setMatchedDestinations] = useState<GuideDestination[]>([]);

  useEffect(() => {
    void trackedFetch("/api/guide/popular")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { results: GuideDestination[] }) => setPopularDestinations(payload.results))
      .catch(() => setPopularDestinations([]));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setCurrentLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const query = keyword.trim();
    if (!query) {
      setMatchedDestinations([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void trackedFetch(`/api/guide/destinations?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((payload: { results: GuideDestination[] }) => setMatchedDestinations(payload.results))
        .catch(() => {
          if (!controller.signal.aborted) setMatchedDestinations([]);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [keyword]);

  const popularPlaces = useMemo(
    () => popularDestinations.length > 0
      ? popularDestinations.map((destination) => destinationToPlace(
          destination,
          distanceMeters(currentLocation, destination.coordinate),
        ))
      : data.places.slice(0, 6).map((place) => ({
          ...place,
          distanceMeters: Math.round(distanceMeters(currentLocation, place.coordinate)),
        })),
    [currentLocation, data.places, popularDestinations],
  );

  const searchResults = useMemo(
    () => matchedDestinations.map((destination) => destinationToPlace(
      destination,
      distanceMeters(currentLocation, destination.coordinate),
    )),
    [currentLocation, matchedDestinations],
  );

  const visiblePlaces = selectedPlace
    ? [selectedPlace, ...popularPlaces.filter((place) => place.id !== selectedPlace.id)]
    : popularPlaces;

  function handleSelectPlace(place: GuidePlace) {
    setSelectedPlace(place);
    setKeyword("");
    router.push(`/guide/transport?${destinationToSearchParams(place)}`);
  }

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <GuideMapView
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

        <NearbyFacilitySheet places={popularPlaces} onSelectPlace={handleSelectPlace} />
      </main>
    </MobileShell>
  );
}

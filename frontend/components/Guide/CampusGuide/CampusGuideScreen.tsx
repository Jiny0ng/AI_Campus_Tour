"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { AppSettingsMenu, FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
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
  const { t, pn } = useAppSettings();
  const [keyword, setKeyword] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<GuidePlace | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CampusCoordinate>(data.currentLocation);
  const [popularDestinations, setPopularDestinations] = useState<GuideDestination[]>([]);
  const [matchedDestinations, setMatchedDestinations] = useState<GuideDestination[]>([]);
  const [recenterUserLocationToken, setRecenterUserLocationToken] = useState(0);

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
          recenterUserLocationToken={recenterUserLocationToken}
        />

        <div className="pointer-events-auto absolute left-4 right-4 top-6 z-30">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.home)}
              className="grid size-[38px] shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card"
              aria-label={t("guide.back")}
            >
              <ChevronLeft size={24} />
            </button>
            <SearchBar
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("guide.searchPlaceholder")}
              containerClassName="h-[38px] flex-1 bg-surface/95"
            />
          </div>
          <GuideSearchResults places={searchResults} onSelectPlace={handleSelectPlace} />
        </div>

        <div className="pointer-events-auto absolute right-4 top-[74px] z-30 flex flex-col items-end gap-3">
          <AppSettingsMenu />
          <FloatingButton icon={<Compass size={21} />} label={t("map.orientation")} />
          <FloatingButton
            icon={<LocateFixed size={21} />}
            label={t("map.recenter")}
            variant="soft"
            onClick={() => setRecenterUserLocationToken((token) => token + 1)}
          />
        </div>

        {selectedPlace ? (
          <div className="pointer-events-none absolute left-1/2 top-[360px] z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-floating">
            {pn(selectedPlace.name)}
          </div>
        ) : null}

        <NearbyFacilitySheet places={popularPlaces} onSelectPlace={handleSelectPlace} />
      </main>
    </MobileShell>
  );
}

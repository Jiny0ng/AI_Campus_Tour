"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { AppSettingsMenu, FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { distanceMeters } from "@/lib/drivingNavigation";
import { resolveCampusLocation } from "@/lib/campusLocation";
import { destinationToPlace, destinationToSearchParams } from "@/lib/guideDestination";
import { trackedFetch } from "@/lib/networkFetch";
import type { CampusCoordinate, CampusGuideData, GuideDestination, GuidePlace, GuidePurpose } from "@/types";
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
  const [selectedPurpose, setSelectedPurpose] = useState<GuidePurpose | null>(null);
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
      (position) => setCurrentLocation(resolveCampusLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }).coordinate),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const query = keyword.trim();
    if (!query && !selectedPurpose) {
      setMatchedDestinations([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const endpoint = selectedPurpose
        ? `/api/guide/discover?purpose=${selectedPurpose}&q=${encodeURIComponent(query)}`
        : `/api/guide/destinations?q=${encodeURIComponent(query)}`;
      void trackedFetch(endpoint, {
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
  }, [keyword, selectedPurpose]);

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
    )).sort((first, second) => {
      const query = keyword.trim().toLocaleLowerCase();
      const relevance = (place: GuidePlace) => {
        const name = place.name.toLocaleLowerCase();
        if (name === query) return 0;
        if (name.startsWith(query)) return 1;
        if (name.includes(query)) return 2;
        return 3;
      };
      return relevance(first) - relevance(second)
        || first.distanceMeters - second.distanceMeters;
    }),
    [currentLocation, keyword, matchedDestinations],
  );

  const purposeFacilityPlaces = useMemo(() => {
    if (!selectedPurpose) return searchResults;
    const expanded = searchResults.flatMap((place) => {
      const facilities = (place.facilities ?? []).filter((facility) =>
        facility.purposes.includes(selectedPurpose),
      );
      if (facilities.length === 0) return [place];
      return facilities.map((facility) => {
        const genericName = ["편의점", "카페", "커피점", "주차장", "열람실", "학습실"].includes(facility.name);
        const description = [
          facility.floor,
          facility.hours,
          facility.features,
          facility.restriction,
          facility.note,
        ].filter(Boolean).join(" · ") || place.description;
        return {
          ...place,
          id: `${place.id}::${facility.id}`,
          name: genericName ? `${place.name} ${facility.name}` : facility.name,
          description,
          facilities: [facility],
        };
      });
    }).sort((first, second) => first.distanceMeters - second.distanceMeters);
    const unique = new Map<string, GuidePlace>();
    for (const place of expanded) {
      const parentId = place.id.split("::", 1)[0];
      const key = parentId;
      const existing = unique.get(key);
      if (!existing || place.description.length > existing.description.length) unique.set(key, place);
    }
    return [...unique.values()].sort((first, second) => first.distanceMeters - second.distanceMeters);
  }, [searchResults, selectedPurpose]);

  const filteredPlaces = selectedPurpose
    ? purposeFacilityPlaces
    : keyword.trim() ? searchResults : popularPlaces;
  const visiblePlaces = selectedPlace
    ? [selectedPlace]
    : keyword.trim() || selectedPurpose
      ? filteredPlaces
      : [];

  function handleSelectPlace(place: GuidePlace) {
    setSelectedPlace(place);
    setKeyword("");
  }

  function handleGuidePlace(place: GuidePlace) {
    router.push(`/guide/transport?${destinationToSearchParams(place)}`);
  }

  const purposeOptions: Array<{ id: GuidePurpose; label: string }> = [
    { id: "convenience_store", label: t("guide.purpose.convenience_store") },
    { id: "cafe", label: t("guide.purpose.cafe") },
    { id: "parking", label: t("guide.purpose.parking") },
  ];

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <GuideMapView
          places={visiblePlaces}
          center={currentLocation}
          selectedPlaceId={selectedPlace?.id}
          onSelectPlace={handleSelectPlace}
          recenterUserLocationToken={recenterUserLocationToken}
          onLocationPermissionDenied={() => window.alert(t("guide.gpsPermission"))}
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
              onChange={(event) => {
                setKeyword(event.target.value);
                setSelectedPurpose(null);
                setSelectedPlace(null);
              }}
              placeholder={t("guide.searchPlaceholder")}
              containerClassName="h-[38px] flex-1 bg-surface/95"
            />
          </div>
          <div className="ml-[46px] mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {purposeOptions.map((purpose) => {
              const selected = selectedPurpose === purpose.id;
              return (
                <button
                  key={purpose.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedPurpose(selected ? null : purpose.id);
                    setSelectedPlace(null);
                  }}
                  className={`h-8 shrink-0 rounded-full px-4 text-xs font-extrabold shadow-card transition ${
                    selected ? "bg-emerald-300 text-emerald-950" : "bg-surface/95 text-ink"
                  }`}
                >
                  {purpose.label}
                </button>
              );
            })}
          </div>
          {keyword.trim() ? <GuideSearchResults places={searchResults} onSelectPlace={handleSelectPlace} /> : null}
        </div>

        <div className="pointer-events-auto absolute right-4 top-[74px] z-30 flex flex-col items-end gap-3">
          <AppSettingsMenu />

          <FloatingButton
            icon={<Compass size={21} />}
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

        <NearbyFacilitySheet
          key={selectedPurpose ?? "popular"}
          places={filteredPlaces}
          selectedPlace={selectedPlace}
          selectedPurpose={selectedPurpose}
          onSelectPlace={handleSelectPlace}
          onGuidePlace={handleGuidePlace}
        />
      </main>
    </MobileShell>
  );
}

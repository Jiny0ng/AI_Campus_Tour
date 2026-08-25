"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { AppSettingsMenu, FloatingButton, SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { distanceMeters } from "@/lib/drivingNavigation";
import { destinationToPlace } from "@/lib/guideDestination";
import { trackedFetch } from "@/lib/networkFetch";
import { getTransportMinutes } from "@/lib/navigation";
import { destinationFromSearchParams, destinationToSearchParams } from "@/lib/guideDestination";
import type { CampusGuideData, GuideDestination, GuidePlace } from "@/types";
import { GuideSearchResults } from "../CampusGuide/GuideSearchResults";
import { TransportMapView } from "./TransportMapView";
import { TransportModeSheet } from "./TransportModeSheet";
import type { TransportMode, TransportOption } from "./TransportOptionGroup";

type TransportModeScreenProps = {
  data: CampusGuideData;
};

function createTransportOptions(
  distanceMeters: number,
  t: (key: string) => string,
): TransportOption[] {
  return [
    { id: "walk", label: t("guide.mode.walk"), minutes: getTransportMinutes(distanceMeters, "walk") },
    { id: "bike", label: t("guide.mode.bike"), minutes: getTransportMinutes(distanceMeters, "bike") },
    { id: "car", label: t("guide.mode.car"), minutes: getTransportMinutes(distanceMeters, "car") },
  ];
}

export function TransportModeScreen({ data }: TransportModeScreenProps) {
  const router = useRouter();
  const { t, pn } = useAppSettings();
  const searchParams = useSearchParams();
  const destination = destinationFromSearchParams(searchParams, data.places[0]);
  const [selectedMode, setSelectedMode] = useState<TransportMode>("walk");
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<GuidePlace[]>([]);
  const [recenterUserLocationToken, setRecenterUserLocationToken] = useState(0);

  const options = useMemo(
    () => createTransportOptions(destination.distanceMeters, t),
    [destination.distanceMeters, t],
  );
  useEffect(() => {
    const query = keyword.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void trackedFetch(`/api/guide/destinations?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((payload: { results: GuideDestination[] }) => setSearchResults(
          payload.results.map((item) => destinationToPlace(
            item,
            Math.round(distanceMeters(data.currentLocation, item.coordinate)),
          )),
        ))
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]); });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [data.currentLocation, keyword]);

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <TransportMapView
          destination={destination}
          recenterUserLocationToken={recenterUserLocationToken}
        />

        <div className="pointer-events-auto absolute left-4 right-4 top-6 z-30">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.guide)}
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
          {keyword.trim() ? (
            <GuideSearchResults
              places={searchResults}
              onSelectPlace={(place) => {
                setKeyword("");
                setSelectedMode("walk");
                router.push(`/guide/transport?${destinationToSearchParams(place)}`);
              }}
            />
          ) : null}
        </div>

        <div className="pointer-events-auto absolute right-4 top-[74px] z-30 flex flex-col items-end gap-3">
          <AppSettingsMenu />
          <FloatingButton icon={<Compass size={21} />} label={t("map.orientation")} />
          <FloatingButton
            icon={<LocateFixed size={21} />}
            label={t("map.recenter")}
            onClick={() => setRecenterUserLocationToken((token) => token + 1)}
          />
        </div>

        <div className="pointer-events-none absolute left-1/2 top-[320px] z-20 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-floating">
          {pn(destination.name)}
        </div>

        <TransportModeSheet
          destination={destination}
          options={options}
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          onStart={() => {
            router.push(
              `/guide/navigation?${destinationToSearchParams(destination)}&mode=${selectedMode}`,
            );
          }}
        />
      </main>
    </MobileShell>
  );
}

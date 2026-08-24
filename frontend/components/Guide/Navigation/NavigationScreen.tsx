"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useAudioGuide } from "@/contexts/AudioGuideContext";
import {
  distanceMeters,
  formatNavigationDistance,
  getDrivingProgress,
} from "@/lib/drivingNavigation";
import { navigationSpeech } from "@/lib/audioGuide/navigationText";
import { destinationFromSearchParams } from "@/lib/guideDestination";
import { trackedFetch } from "@/lib/networkFetch";
import {
  getArrivalTime,
  getRouteSummary,
  getTransportLabel,
  TransportModeValue,
} from "@/lib/navigation";
import type {
  CampusCoordinate,
  CampusGuideData,
  GuideDestination,
  DrivingRoute,
} from "@/types";
import { NavigationMapView } from "./NavigationMapView";
import { NavigationStatusPanel } from "./NavigationStatusPanel";

type NavigationScreenProps = {
  data: CampusGuideData;
};

const REROUTE_COOLDOWN_MILLISECONDS = 15_000;
const MINIMUM_OFF_ROUTE_METERS = 35;

function normalizeMode(value: string | null): TransportModeValue {
  if (value === "car" || value === "bike") {
    return value;
  }

  return "walk";
}

export function NavigationScreen({ data }: NavigationScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useAppSettings();
  const { speak, prefetch, clearCategory } = useAudioGuide();
  const mode = normalizeMode(searchParams.get("mode"));
  const destination = destinationFromSearchParams(searchParams, data.places[0]);
  const fallbackSummary = getRouteSummary(destination, mode);
  const [currentLocation, setCurrentLocation] = useState<CampusCoordinate>(data.currentLocation);
  const [routeOrigin, setRouteOrigin] = useState<CampusCoordinate>(data.currentLocation);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [docentMessage, setDocentMessage] = useState<string | null>(null);
  const receivedLiveLocationRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  const spokenGuideRef = useRef<string | null>(null);
  const destinationSpokenRef = useRef<string | null>(null);
  const announcedFacilityIdsRef = useRef(new Set<string>());
  const lastNearbyOriginRef = useRef<CampusCoordinate | null>(null);
  const lastDocentAtRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setRouteError(null);
    setRouteLoading(true);

    const routeUrl = mode === "car" ? "/api/directions/driving" : "/api/guide/route";
    trackedFetch(routeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: routeOrigin,
        goal: destination.coordinate,
        ...(mode === "car" ? {} : { mode }),
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Directions request failed");
        return response.json();
      })
      .then((route: DrivingRoute) => {
        if (route.path.length < 2) throw new Error("Directions returned an empty path");
        setDrivingRoute(route);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setRouteError(`${getTransportLabel(mode)} 경로를 불러오지 못했습니다.`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });

    return () => controller.abort();
  }, [
    destination.coordinate.lat,
    destination.coordinate.lng,
    mode,
    routeOrigin.lat,
    routeOrigin.lng,
  ]);

  useEffect(() => {
    setRouteOrigin(currentLocation);
    spokenGuideRef.current = null;
    destinationSpokenRef.current = null;
    announcedFacilityIdsRef.current.clear();
    setDocentMessage(null);
  }, [destination.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationWarning("GPS를 사용할 수 없어 마지막 위치로 안내합니다.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(nextLocation);
        setLocationAccuracy(position.coords.accuracy);
        setLocationWarning(null);

        if (!receivedLiveLocationRef.current) {
          receivedLiveLocationRef.current = true;
          lastRerouteAtRef.current = Date.now();
          setRouteOrigin(nextLocation);
        }
      },
      () => {
        setLocationWarning("GPS 권한을 허용하면 실시간 재탐색을 사용할 수 있습니다.");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode]);

  const drivingProgress = useMemo(
    () => drivingRoute ? getDrivingProgress(drivingRoute, currentLocation) : null,
    [currentLocation, drivingRoute],
  );

  useEffect(() => {
    if (!drivingRoute) return;
    const nextIndex = drivingProgress?.nextGuide
      ? drivingRoute.guides.findIndex((guide) => guide.pointIndex === drivingProgress.nextGuide?.pointIndex)
      : 0;
    drivingRoute.guides.slice(Math.max(0, nextIndex), Math.max(0, nextIndex) + 3).forEach((guide) => {
      const speech = navigationSpeech(guide, guide.distanceMeters, locale);
      void prefetch({
        id: `prefetch:${drivingRoute.generatedAt ?? "route"}:${guide.pointIndex}:${locale}`,
        text: speech.text,
        locale,
        category: speech.maneuver === "arrive" ? "arrival" : "navigation",
        priority: speech.maneuver === "arrive" ? 90 : 100,
        source: { kind: "asset", assetId: speech.assetId },
        interruptible: false,
      });
    });
  }, [drivingProgress?.nextGuide, drivingRoute, locale, prefetch]);

  useEffect(() => {
    if (!drivingProgress || !drivingRoute) return;
    if (locationAccuracy !== null && locationAccuracy > 50) return;
    if (distanceMeters(currentLocation, destination.coordinate) <= 25) return;

    const rerouteThreshold = Math.max(
      MINIMUM_OFF_ROUTE_METERS,
      (locationAccuracy ?? 0) * 1.5,
    );
    const now = Date.now();
    if (
      drivingProgress.distanceFromRouteMeters > rerouteThreshold
      && now - lastRerouteAtRef.current >= REROUTE_COOLDOWN_MILLISECONDS
    ) {
      lastRerouteAtRef.current = now;
      setRouteOrigin(currentLocation);
    }
  }, [
    currentLocation,
    destination.coordinate,
    drivingProgress,
    drivingRoute,
    locationAccuracy,
    mode,
  ]);

  useEffect(() => {
    if (!drivingProgress?.nextGuide) return;
    const triggerDistance = mode === "car" ? 180 : 40;
    if (drivingProgress.distanceToNextGuideMeters > triggerDistance) return;

    const guide = drivingProgress.nextGuide;
    const guideKey = `${drivingRoute?.generatedAt ?? "route"}:${guide.pointIndex}`;
    if (spokenGuideRef.current === guideKey) return;
    spokenGuideRef.current = guideKey;

    const speech = navigationSpeech(guide, drivingProgress.distanceToNextGuideMeters, locale);
    void speak({
      id: `navigation:${guideKey}:${locale}`,
      text: speech.text,
      locale,
      category: speech.maneuver === "arrive" ? "arrival" : "navigation",
      priority: speech.maneuver === "arrive" ? 90 : 100,
      source: { kind: "asset", assetId: speech.assetId },
      interruptible: false,
      expiresAt: Date.now() + (mode === "car" ? 45_000 : 30_000),
    });
  }, [drivingProgress, drivingRoute?.generatedAt, locale, mode, speak]);

  useEffect(() => {
    if (!drivingRoute || destinationSpokenRef.current === destination.id) return;
    destinationSpokenRef.current = destination.id;
    const message = `${destination.name}. ${destination.description}`;
    setDocentMessage(message);
    lastDocentAtRef.current = Date.now();

    const timer = window.setTimeout(() => {
      void speak({
        id: `guide-destination:${destination.id}:${locale}`,
        text: message,
        locale: /[가-힣]/.test(message) ? "ko" : locale,
        category: "location-docent",
        priority: 30,
        source: { kind: "tts" },
        interruptible: true,
        resumePolicy: "resume",
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [destination.description, destination.id, destination.name, drivingRoute, locale, speak]);

  useEffect(() => {
    if (!drivingRoute) return;
    if (Date.now() - lastDocentAtRef.current < 8_000) return;
    if (
      lastNearbyOriginRef.current
      && distanceMeters(lastNearbyOriginRef.current, currentLocation) < 50
    ) return;
    lastNearbyOriginRef.current = currentLocation;

    const controller = new AbortController();
    void trackedFetch("/api/guide/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        radiusMeters: 250,
      }),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { results: Array<GuideDestination & { distanceMeters: number }> }) => {
        const facility = payload.results.find((item) => (
          item.id !== destination.id && !announcedFacilityIdsRef.current.has(item.id)
        ));
        if (!facility) return;
        announcedFacilityIdsRef.current.add(facility.id);
        const message = `주변 ${facility.distanceMeters}미터 이내에 ${facility.name}이 있습니다. ${facility.description}`;
        setDocentMessage(message);

        const canSpeak = mode !== "car"
          && Date.now() - lastDocentAtRef.current >= 60_000
          && (!drivingProgress?.nextGuide || drivingProgress.distanceToNextGuideMeters > 220);
        if (canSpeak) {
          lastDocentAtRef.current = Date.now();
          void speak({
            id: `guide-nearby:${facility.id}:${locale}`,
            text: message,
            locale: /[가-힣]/.test(message) ? "ko" : locale,
            category: "location-docent",
            priority: 30,
            source: { kind: "tts" },
            interruptible: true,
            resumePolicy: "discard",
          });
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [currentLocation, destination.id, drivingProgress, drivingRoute, locale, mode, speak]);

  useEffect(() => () => {
    clearCategory("navigation");
    clearCategory("arrival");
    clearCategory("core-docent");
    clearCategory("location-docent");
  }, [clearCategory]);

  const remainingDuration = drivingProgress?.remainingDurationMilliseconds
    ?? drivingRoute?.durationMilliseconds;
  const remainingDistance = drivingProgress?.remainingDistanceMeters
    ?? drivingRoute?.distanceMeters;
  const drivingMinutes = remainingDuration !== undefined
    ? remainingDistance !== undefined && remainingDistance <= 25
      ? 0
      : Math.max(1, Math.ceil(remainingDuration / 60000))
    : fallbackSummary.minutes;
  const summary = drivingRoute && remainingDistance !== undefined
    ? {
        minutes: drivingMinutes,
        modeLabel: getTransportLabel(mode),
        arrivalTime: getArrivalTime(drivingMinutes),
        remainingDistance: `${formatNavigationDistance(remainingDistance)} 남음`,
      }
    : fallbackSummary;
  const nextInstruction = drivingProgress?.nextGuide?.instruction
    ?? (routeLoading ? "자동차 경로를 찾는 중입니다" : "경로를 따라 진행하세요");
  const nextInstructionDistance = drivingProgress?.nextGuide
    ? drivingProgress.nextGuide.type === 88
      ? "목적지 도착"
      : `${formatNavigationDistance(drivingProgress.distanceToNextGuideMeters)} 앞`
    : routeLoading ? "잠시만 기다려 주세요" : "GPS 위치 확인 중";
  const bannerMessage = routeError ?? locationWarning;

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <NavigationMapView
          currentLocation={currentLocation}
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
        </div>

        {bannerMessage ? (
          <div className="absolute left-4 right-4 top-[150px] z-30 rounded-card bg-surface/95 px-3 py-2 text-center text-xs font-bold text-red-600 shadow-card">
            {bannerMessage}
          </div>
        ) : null}

        {docentMessage ? (
          <div className={`absolute left-4 right-4 ${bannerMessage ? "top-[194px]" : "top-[150px]"} z-20 rounded-card bg-primary-soft/95 px-4 py-3 shadow-card`}>
            <p className="text-[11px] font-extrabold text-primary">CAMPUS DOCENT</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-ink">
              {docentMessage}
            </p>
          </div>
        ) : null}

        <NavigationStatusPanel
          destination={destination}
          mode={mode}
          modeLabel={summary.modeLabel}
          minutes={summary.minutes}
          remainingDistance={summary.remainingDistance}
          arrivalTime={summary.arrivalTime}
          nextInstruction={nextInstruction}
          nextInstructionDistance={nextInstructionDistance}
          onChangeRoute={() => router.push(APP_ROUTES.guide)}
          onEnd={() => router.push(APP_ROUTES.home)}
        />
      </main>
    </MobileShell>
  );
}

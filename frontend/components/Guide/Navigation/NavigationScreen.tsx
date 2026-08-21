"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import {
  distanceMeters,
  formatNavigationDistance,
  getDrivingProgress,
} from "@/lib/drivingNavigation";
import { destinationFromSearchParams } from "@/lib/guideDestination";
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
    fetch(routeUrl, {
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
          setRouteError("자동차 경로를 불러오지 못했습니다.");
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
    if (mode !== "car" || !drivingProgress?.nextGuide || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    if (drivingProgress.distanceToNextGuideMeters > 180) return;

    const guide = drivingProgress.nextGuide;
    const guideKey = `${drivingRoute?.generatedAt ?? "route"}:${guide.pointIndex}`;
    if (spokenGuideRef.current === guideKey) return;
    spokenGuideRef.current = guideKey;

    const distance = formatNavigationDistance(drivingProgress.distanceToNextGuideMeters);
    const utterance = new SpeechSynthesisUtterance(
      guide.type === 88 ? "목적지에 도착했습니다." : `${distance} 앞, ${guide.instruction}`,
    );
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [drivingProgress, drivingRoute?.generatedAt, mode]);

  useEffect(() => {
    if (!drivingRoute || destinationSpokenRef.current === destination.id) return;
    destinationSpokenRef.current = destination.id;
    const message = `${destination.name}. ${destination.description}`;
    setDocentMessage(message);
    lastDocentAtRef.current = Date.now();

    const timer = window.setTimeout(() => {
      if (!("speechSynthesis" in window)) return;
      if (
        mode === "car"
        && drivingRoute.guides[0]
        && drivingRoute.guides[0].distanceMeters <= 180
      ) return;
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "ko-KR";
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [destination.description, destination.id, destination.name, drivingRoute, mode]);

  useEffect(() => {
    if (!drivingRoute) return;
    if (Date.now() - lastDocentAtRef.current < 8_000) return;
    if (
      lastNearbyOriginRef.current
      && distanceMeters(lastNearbyOriginRef.current, currentLocation) < 50
    ) return;
    lastNearbyOriginRef.current = currentLocation;

    const controller = new AbortController();
    void fetch("/api/guide/nearby", {
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

        const canSpeak = Date.now() - lastDocentAtRef.current >= 45_000
          && (!drivingProgress?.nextGuide || drivingProgress.distanceToNextGuideMeters > 220);
        if (canSpeak && "speechSynthesis" in window) {
          lastDocentAtRef.current = Date.now();
          const utterance = new SpeechSynthesisUtterance(message);
          utterance.lang = "ko-KR";
          utterance.rate = 1;
          window.speechSynthesis.speak(utterance);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [currentLocation, destination.id, drivingProgress, drivingRoute]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

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

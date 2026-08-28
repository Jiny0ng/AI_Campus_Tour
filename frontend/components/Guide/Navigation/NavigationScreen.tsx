"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Compass, LocateFixed } from "lucide-react";
import { AppSettingsMenu, FloatingButton, SearchBar } from "@/components/Common";
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
import { resolveCampusLocation } from "@/lib/campusLocation";
import { trackedFetch } from "@/lib/networkFetch";
import {
  getArrivalTime,
  getTransportMinutes,
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

function formatMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, String(value)),
    template,
  );
}

export function NavigationScreen({ data }: NavigationScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t, pn } = useAppSettings();
  const { speak, prefetch, clearCategory } = useAudioGuide();
  const mode = normalizeMode(searchParams.get("mode"));
  const destination = destinationFromSearchParams(searchParams, data.places[0]);
  const modeLabel = t(`guide.modeLabel.${mode}`);
  const fallbackMinutes = getTransportMinutes(destination.distanceMeters, mode);
  const [currentLocation, setCurrentLocation] = useState<CampusCoordinate>(data.currentLocation);
  const [routeOrigin, setRouteOrigin] = useState<CampusCoordinate>(data.currentLocation);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [recenterUserLocationToken, setRecenterUserLocationToken] = useState(0);
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
          setRouteError(formatMessage(t("guide.routeError"), { mode: modeLabel }));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });

    return () => controller.abort();
  }, [
    destination.coordinate.lat,
    destination.coordinate.lng,
    modeLabel,
    mode,
    routeOrigin.lat,
    routeOrigin.lng,
    t,
  ]);

  useEffect(() => {
    setRouteOrigin(currentLocation);
    spokenGuideRef.current = null;
    destinationSpokenRef.current = null;
    announcedFacilityIdsRef.current.clear();
  }, [destination.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationWarning(t("guide.gpsUnavailable"));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = resolveCampusLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }).coordinate;
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
        setLocationWarning(t("guide.gpsPermission"));
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, t]);

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
        const message = `주변 ${facility.distanceMeters}미터 이내에 ${pn(facility.name)}이 있습니다. ${facility.description}`;

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
    : fallbackMinutes;
  const summary = drivingRoute && remainingDistance !== undefined
    ? {
        minutes: drivingMinutes,
        modeLabel,
        arrivalTime: getArrivalTime(drivingMinutes),
        remainingDistance: formatMessage(t("guide.remaining"), {
          distance: formatNavigationDistance(remainingDistance),
        }),
      }
    : {
        minutes: fallbackMinutes,
        modeLabel,
        arrivalTime: getArrivalTime(fallbackMinutes),
        remainingDistance: formatMessage(t("guide.remaining"), {
          distance: `${Math.max(destination.distanceMeters, 120)}m`,
        }),
      };
  const nextInstruction = drivingProgress?.nextGuide?.instruction
    ?? (routeLoading
      ? formatMessage(t("guide.routeLoading"), { mode: modeLabel })
      : t("guide.routeFollow"));
  const nextInstructionDistance = drivingProgress?.nextGuide
    ? drivingProgress.nextGuide.type === 88
      ? t("guide.arrived")
      : formatMessage(t("guide.ahead"), {
          distance: formatNavigationDistance(drivingProgress.distanceToNextGuideMeters),
        })
    : routeLoading ? t("guide.wait") : t("guide.gpsChecking");
  const bannerMessage = routeError ?? locationWarning;

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <NavigationMapView
          currentLocation={currentLocation}
          destination={destination}
          drivingRoute={drivingRoute}
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
              value={pn(destination.name)}
              readOnly
              placeholder={t("guide.searchPlaceholder")}
              containerClassName="h-[38px] flex-1 bg-surface/95"
            />
          </div>
        </div>

        {bannerMessage ? (
          <div className="pointer-events-auto fixed left-[max(62px,calc(50%_-_153px))] top-[108px] z-[89] w-[min(220px,calc(100vw_-_154px))] rounded-full bg-surface/95 px-3 py-2 text-center text-xs font-bold text-red-600 shadow-card backdrop-blur-md">
            {bannerMessage}
          </div>
        ) : null}

        <div className="pointer-events-auto absolute right-4 top-[74px] z-30 flex flex-col items-end gap-3">
          <AppSettingsMenu />

          <FloatingButton
            icon={<Compass size={21} />}
            label={t("map.recenter")}
            onClick={() => setRecenterUserLocationToken((token) => token + 1)}
          />
        </div>

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

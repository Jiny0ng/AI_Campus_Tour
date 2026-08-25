"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, LocateFixed } from "lucide-react";
import { FloatingButton } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { campusCenter } from "@/constants/campus";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useAudioGuide } from "@/contexts/AudioGuideContext";
import { clientDebug, clientDebugError } from "@/lib/clientDebug";
import { trackedFetch } from "@/lib/networkFetch";
import { recordTipViewed, recordVisitedPlace } from "@/lib/audioGuide/sessionReport";
import type {
  CampusTourData,
  CampusTourNearbySpot,
  CampusTourRouteSegment,
  CampusTourSegmentInfo,
  CampusTourStop,
} from "@/types";
import { AiTourSheet } from "./AiTourSheet";
import { TourMapBackground } from "./TourMapBackground";
import { TourStopIndicator } from "./TourStopIndicator";
import { TourSettingsMenu } from "./TourSettingsMenu";

type CampusTourScreenProps = {
  data: CampusTourData;
};

const segmentInfoCache = new Map<string, CampusTourSegmentInfo>();
const segmentRequestCache = new Map<string, Promise<CampusTourSegmentInfo>>();
const CURRENT_LOCATION_STOP_ID = "current_location";
const OFF_ROUTE_THRESHOLD_METERS = 15;

function addCurrentLocationStart(data: CampusTourData): CampusTourData {
  if (data.stops.some((stop) => stop.id === CURRENT_LOCATION_STOP_ID)) return data;

  const firstStop = data.stops[0];
  if (!firstStop) return data;

  return {
    ...data,
    stops: [
      {
        id: CURRENT_LOCATION_STOP_ID,
        name: "현위치",
        description: "투어를 시작한 위치입니다.",
        tags: [],
        studentTip: [],
        nextStopId: firstStop.id,
        mapPoint: firstStop.mapPoint,
      },
      ...data.stops,
    ],
  };
}

function segmentCacheKey(from: CampusTourStop, to: CampusTourStop, language: string) {
  return [
    from.id,
    from.mapPoint.y.toFixed(6),
    from.mapPoint.x.toFixed(6),
    to.id,
    to.mapPoint.y.toFixed(6),
    to.mapPoint.x.toFixed(6),
    language,
  ].join(":");
}

function loadSegmentInfo(from: CampusTourStop, to: CampusTourStop, language: string) {
  const key = segmentCacheKey(from, to, language);
  const cached = segmentInfoCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = segmentRequestCache.get(key);
  if (pending) return pending;

  const request = trackedFetch("/api/tour/segment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_location: from.name,
      current_lat: from.mapPoint.y,
      current_lng: from.mapPoint.x,
      next_location: to.name,
      next_lat: to.mapPoint.y,
      next_lng: to.mapPoint.x,
      language,
    }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("Segment information request failed");
      return response.json() as Promise<CampusTourSegmentInfo>;
    })
    .then((result) => {
      segmentInfoCache.set(key, result);
      segmentRequestCache.delete(key);
      return result;
    })
    .catch((error) => {
      segmentRequestCache.delete(key);
      throw error;
    });

  segmentRequestCache.set(key, request);
  return request;
}

type LatLng = { lat: number; lng: number };

function distanceMeters(first: LatLng, second: LatLng) {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function distanceToRouteMeters(location: LatLng, segments: CampusTourRouteSegment[]) {
  const points = segments.flatMap((segment) =>
    segment.points.map((point) => ({ lat: point.y, lng: point.x })),
  );
  if (points.length < 2) return null;

  const earthRadius = 6371000;
  const latitudeOrigin = location.lat * Math.PI / 180;
  const toLocalMeters = (point: LatLng) => ({
    x: (point.lng - location.lng) * Math.PI / 180 * earthRadius * Math.cos(latitudeOrigin),
    y: (point.lat - location.lat) * Math.PI / 180 * earthRadius,
  });

  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = toLocalMeters(points[index]);
    const end = toLocalMeters(points[index + 1]);
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX ** 2 + deltaY ** 2;
    const projection = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(start.x * deltaX + start.y * deltaY) / lengthSquared));
    const closestX = start.x + projection * deltaX;
    const closestY = start.y + projection * deltaY;
    nearestDistance = Math.min(nearestDistance, Math.hypot(closestX, closestY));
  }
  return nearestDistance;
}

function remainingRouteDistance(
  location: LatLng | null,
  segments: CampusTourRouteSegment[],
) {
  const points = segments.flatMap((segment) =>
    segment.points.map((point) => ({ lat: point.y, lng: point.x })),
  );
  if (points.length < 2) return null;

  let nearestIndex = 0;
  let approachDistance = 0;
  if (location) {
    let nearestDistance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = distanceMeters(location, point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    approachDistance = nearestDistance;
  }

  let routeDistance = 0;
  for (let index = nearestIndex; index < points.length - 1; index += 1) {
    routeDistance += distanceMeters(points[index], points[index + 1]);
  }
  return Math.round(approachDistance + routeDistance);
}

export function CampusTourScreen({ data }: CampusTourScreenProps) {
  const router = useRouter();
  const { locale, t } = useAppSettings();
  const { speak, prefetch, stop, clearCategory, beginNetworkGrace } = useAudioGuide();
  const [tourData, setTourData] = useState(() => addCurrentLocationStart(data));
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [nearbySpots, setNearbySpots] = useState<CampusTourNearbySpot[]>([]);
  const [isNearbyLoading, setIsNearbyLoading] = useState(true);
  const [addingSpotId, setAddingSpotId] = useState<string | null>(null);
  const [segmentInfo, setSegmentInfo] = useState<CampusTourSegmentInfo | null>(null);
  const [isSegmentLoading, setIsSegmentLoading] = useState(false);
  const [arrivedStopId, setArrivedStopId] = useState<string | null>(null);
  const [recenterUserLocationToken, setRecenterUserLocationToken] = useState(0);
  const [isOffRouteDialogOpen, setIsOffRouteDialogOpen] = useState(false);
  const startLocationInitializedRef = useRef(false);
  const offRouteWarningArmedRef = useRef(true);
  const lastRouteDistanceLogRef = useRef<number | null>(null);
  const narratedStopIdsRef = useRef(new Set<string>());
  const confirmedArrivalStopIdsRef = useRef(new Set<string>());
  const previousLocaleRef = useRef(locale);

  useEffect(() => {
    beginNetworkGrace();
    clientDebug("tour", "mounted", {
      stops: data.stops.length,
      routeSegments: data.routeSegments.length,
    });
    return () => clientDebug("tour", "unmounted");
  }, [beginNetworkGrace, data.routeSegments.length, data.stops.length]);

  const currentStop = tourData?.stops?.[currentStopIndex];
  const nextStop = currentStop?.nextStopId
    ? tourData.stops.find((stop) => stop.id === currentStop.nextStopId)
    : undefined;
  const isLastStop = tourData?.stops?.length > 0 && currentStopIndex === tourData.stops.length - 1;

  const currentSegment = useMemo(() => {
    if (!currentStop || !nextStop) return [];
    return tourData.routeSegments.filter(
      (segment) =>
        segment.fromStopId === currentStop.id && segment.toStopId === nextStop.id,
    );
  }, [currentStop, nextStop, tourData.routeSegments]);

  const mapCenter = currentStop
    ? { lat: currentStop.mapPoint.y, lng: currentStop.mapPoint.x }
    : campusCenter;

  const directDistanceToNext = useMemo(() => {
    if (!userLocation || !nextStop) return null;
    return distanceMeters(userLocation, {
      lat: nextStop.mapPoint.y,
      lng: nextStop.mapPoint.x,
    });
  }, [nextStop, userLocation]);

  const hasArrived = Boolean(nextStop && arrivedStopId === nextStop.id);
  const needsArrivalConfirmation = Boolean(
    nextStop
    && directDistanceToNext !== null
    && directDistanceToNext <= 10
    && locationAccuracy !== null
    && locationAccuracy > 30
    && !hasArrived,
  );
  const canAdvance = isLastStop
    ? Boolean(currentStop && arrivedStopId === currentStop.id)
    : hasArrived;
  const remainingDistance = hasArrived
    ? 0
    : remainingRouteDistance(userLocation, currentSegment);
  const distanceFromRoute = useMemo(() => {
    if (!userLocation) return null;
    return distanceToRouteMeters(userLocation, currentSegment);
  }, [currentSegment, userLocation]);
  const narrationStop = nextStop ?? currentStop;
  const narrationText = useMemo(() => {
    if (!narrationStop) return "";
    return (locale === "ko" ? narrationStop.docentText : "")
      || segmentInfo?.tips.find((tipInfo) => (
        tipInfo.name.includes(narrationStop.name)
        || narrationStop.name.includes(tipInfo.name)
      ))?.tip
      || narrationStop.description;
  }, [locale, narrationStop, segmentInfo?.tips]);
  const hasReviewedNarration = locale === "ko" && Boolean(narrationStop?.docentText);

  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    stop("language-change");
    clearCategory("core-docent");
    clearCategory("location-docent");
    if (!narrationStop) return;
    const narrationId = `${narrationStop.id}:${locale}`;
    if (window.confirm(t("settings.languageReplay"))) {
      narratedStopIdsRef.current.delete(narrationId);
    } else {
      narratedStopIdsRef.current.add(narrationId);
    }
  }, [clearCategory, locale, narrationStop, stop, t]);

  useEffect(() => {
    // Only immutable, reviewed tour scripts are prefetched. Dynamic segment
    // tips may need model synthesis and should never delay or colour the tour
    // start as a network problem.
    if (!narrationStop || !narrationText || !hasReviewedNarration) return;
    void prefetch({
      id: `prefetch:tour-stop:${narrationStop.id}:${locale}`,
      text: narrationText,
      locale,
      category: hasReviewedNarration ? "core-docent" : "location-docent",
      priority: hasReviewedNarration ? 50 : 30,
      source: hasReviewedNarration
        ? { kind: "asset", assetId: `core-docent:${narrationStop.id}:${locale}` }
        : { kind: "tts" },
      interruptible: true,
      resumePolicy: "resume",
      report: { placeId: narrationStop.id, placeName: narrationStop.name, include: true },
    });
  }, [hasReviewedNarration, locale, narrationStop, narrationText, prefetch]);

  useEffect(() => {
    if (!narrationStop || !narrationText) return;
    const arrived = nextStop ? hasArrived : canAdvance;
    const manuallyConfirmed = confirmedArrivalStopIdsRef.current.has(narrationStop.id);
    if (!arrived || (locationAccuracy !== null && locationAccuracy > 30 && !manuallyConfirmed)) return;
    const narrationId = `${narrationStop.id}:${locale}`;
    if (narratedStopIdsRef.current.has(narrationId)) return;
    narratedStopIdsRef.current.add(narrationId);
    void speak({
      id: `tour-stop:${narrationId}`,
      text: narrationText,
      locale,
      category: hasReviewedNarration ? "core-docent" : "location-docent",
      priority: hasReviewedNarration ? 50 : 30,
      source: hasReviewedNarration
        ? { kind: "asset", assetId: `core-docent:${narrationStop.id}:${locale}` }
        : { kind: "tts" },
      interruptible: true,
      resumePolicy: "resume",
      report: { placeId: narrationStop.id, placeName: narrationStop.name, include: true },
    });
  }, [canAdvance, hasArrived, hasReviewedNarration, locale, locationAccuracy, narrationStop, narrationText, nextStop, speak]);

  useEffect(() => {
    if (distanceFromRoute === null) return;
    const roundedDistance = Math.round(distanceFromRoute);
    if (
      lastRouteDistanceLogRef.current === null
      || Math.abs(roundedDistance - lastRouteDistanceLogRef.current) >= 5
    ) {
      lastRouteDistanceLogRef.current = roundedDistance;
      clientDebug("route", "distance-updated", {
        distanceMeters: roundedDistance,
        thresholdMeters: OFF_ROUTE_THRESHOLD_METERS,
        currentStopId: currentStop?.id,
        nextStopId: nextStop?.id,
      });
    }
    if (distanceFromRoute <= OFF_ROUTE_THRESHOLD_METERS) {
      offRouteWarningArmedRef.current = true;
      return;
    }
    if (!offRouteWarningArmedRef.current) return;
    offRouteWarningArmedRef.current = false;
    clientDebug("route", "off-route-dialog-opened", {
      distanceMeters: roundedDistance,
    });
    setIsOffRouteDialogOpen(true);
  }, [currentStop?.id, distanceFromRoute, nextStop?.id]);

  useEffect(() => {
    if (
      nextStop
      && directDistanceToNext !== null
      && directDistanceToNext <= 10
      && (locationAccuracy === null || locationAccuracy <= 30)
    ) {
      setArrivedStopId(nextStop.id);
      recordVisitedPlace(nextStop.id, nextStop.name);
    }
  }, [directDistanceToNext, locationAccuracy, nextStop]);

  useEffect(() => {
    if (!currentStop || !nextStop) {
      setSegmentInfo(null);
      setIsSegmentLoading(false);
      return;
    }
    if (
      currentStop.id === CURRENT_LOCATION_STOP_ID
      && !startLocationInitializedRef.current
    ) {
      setSegmentInfo(null);
      setIsSegmentLoading(true);
      return;
    }

    let cancelled = false;
    const cached = segmentInfoCache.get(segmentCacheKey(currentStop, nextStop, locale));
    setIsSegmentLoading(!cached);
    setSegmentInfo(cached ?? null);

    loadSegmentInfo(currentStop, nextStop, locale)
      .then((result) => {
        if (cancelled) return;
        setSegmentInfo(result);

        const followingStop = nextStop.nextStopId
          ? tourData.stops.find((stop) => stop.id === nextStop.nextStopId)
          : undefined;
        if (followingStop) {
          void loadSegmentInfo(nextStop, followingStop, locale).catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setSegmentInfo(null);
      })
      .finally(() => {
        if (!cancelled) setIsSegmentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentStop, locale, nextStop, tourData.stops]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setIsNearbyLoading(false);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setLocationAccuracy(position.coords.accuracy);
        clientDebug("geolocation", "position", {
          ...nextLocation,
          accuracyMeters: Math.round(position.coords.accuracy),
          heading: position.coords.heading,
        });

        if (startLocationInitializedRef.current) return;
        startLocationInitializedRef.current = true;

        const firstStop = data.stops[0];
        if (!firstStop) return;

        setTourData((previous) => ({
          ...previous,
          stops: previous.stops.map((stop) =>
            stop.id === CURRENT_LOCATION_STOP_ID
              ? {
                  ...stop,
                  mapPoint: { x: nextLocation.lng, y: nextLocation.lat },
                }
              : stop,
          ),
        }));

        void trackedFetch("/api/tour/start-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_lat: nextLocation.lat,
            current_lng: nextLocation.lng,
            first_stop_id: firstStop.id,
            first_stop_lat: firstStop.mapPoint.y,
            first_stop_lng: firstStop.mapPoint.x,
          }),
        })
          .then((response) => {
            if (!response.ok) throw new Error("Start route request failed");
            return response.json() as Promise<{ segment: CampusTourRouteSegment }>;
          })
          .then(({ segment }) => {
            clientDebug("route", "start-route-loaded", {
              pointCount: segment.points.length,
              fromStopId: segment.fromStopId,
              toStopId: segment.toStopId,
            });
            setTourData((previous) => ({
              ...previous,
              routeSegments: [
                segment,
                ...previous.routeSegments.filter(
                  (routeSegment) => routeSegment.fromStopId !== CURRENT_LOCATION_STOP_ID,
                ),
              ],
            }));
          })
          .catch((error) => {
            clientDebugError("route", "start-route-fallback", error);
            setTourData((previous) => ({
              ...previous,
              routeSegments: [
                {
                  fromStopId: CURRENT_LOCATION_STOP_ID,
                  toStopId: firstStop.id,
                  points: [
                    { x: nextLocation.lng, y: nextLocation.lat },
                    firstStop.mapPoint,
                  ],
                },
                ...previous.routeSegments.filter(
                  (routeSegment) => routeSegment.fromStopId !== CURRENT_LOCATION_STOP_ID,
                ),
              ],
            }));
          });
      },
      (error) => {
        clientDebugError("geolocation", "watch-error", new Error(error.message));
        setIsNearbyLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [data]);

  useEffect(() => {
    const destination = nextStop || currentStop;
    if (!destination || destination.id === CURRENT_LOCATION_STOP_ID) {
      setNearbySpots([]);
      setIsNearbyLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsNearbyLoading(true);

    trackedFetch("/api/tour/nearby-spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination_id: destination.id,
        latitude: destination.mapPoint.y,
        longitude: destination.mapPoint.x,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Nearby spots request failed");
        return response.json();
      })
      .then((result: { nearbySpots: CampusTourNearbySpot[] }) => {
        setNearbySpots(result.nearbySpots);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setNearbySpots([]);
      })
      .finally(() => setIsNearbyLoading(false));

    return () => controller.abort();
  }, [currentStop, nextStop]);

  async function handleAddWaypoint(spot: CampusTourNearbySpot) {
    if (!userLocation || !currentStop || !nextStop || addingSpotId) return;

    setAddingSpotId(spot.id);
    try {
      const response = await trackedFetch("/api/tour/waypoint-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_lat: userLocation.lat,
          current_lng: userLocation.lng,
          spot_id: spot.id,
          spot_name: spot.name,
          spot_lat: spot.latitude,
          spot_lng: spot.longitude,
          next_stop_id: nextStop.id,
          next_lat: nextStop.mapPoint.y,
          next_lng: nextStop.mapPoint.x,
          language: locale,
        }),
      });
      if (!response.ok) throw new Error("Waypoint route request failed");

      const result = (await response.json()) as {
        stop: CampusTourStop;
        segments: CampusTourRouteSegment[];
      };

      setTourData((previous) => {
        if (previous.stops.some((stop) => stop.id === spot.id)) return previous;

        const stops = [...previous.stops];
        stops[currentStopIndex] = { ...currentStop, nextStopId: spot.id };
        stops.splice(currentStopIndex + 1, 0, {
          ...result.stop,
          description: spot.docentText || spot.description || result.stop.description,
          docentText: spot.docentText,
        });

        const segmentIndex = previous.routeSegments.findIndex(
          (segment) =>
            segment.fromStopId === currentStop.id && segment.toStopId === nextStop.id,
        );
        const insertedSegments = [
          { ...result.segments[0], fromStopId: currentStop.id },
          result.segments[1],
        ];
        const routeSegments = [...previous.routeSegments];
        if (segmentIndex >= 0) {
          routeSegments.splice(segmentIndex, 1, ...insertedSegments);
        } else {
          routeSegments.push(...insertedSegments);
        }

        return { ...previous, stops, routeSegments };
      });
    } finally {
      setAddingSpotId(null);
    }
  }

  function handleNext() {
    if (needsArrivalConfirmation && nextStop) {
      confirmedArrivalStopIdsRef.current.add(nextStop.id);
      setArrivedStopId(nextStop.id);
      recordVisitedPlace(nextStop.id, nextStop.name);
      return;
    }
    if (isLastStop) {
      router.push(APP_ROUTES.tourSummary);
      return;
    }
    if (tourData?.stops?.length > 0) {
      setCurrentStopIndex((index) => Math.min(index + 1, tourData.stops.length - 1));
    }
  }

  function handlePrev() {
    setCurrentStopIndex((index) => Math.max(index - 1, 0));
  }

  function handleListenTip(tip: CampusTourSegmentInfo["tips"][number]) {
    if (!narrationStop) return;
    void speak({
      id: `tour-tip:${narrationStop.id}:${tip.name}:${locale}:${Date.now()}`,
      text: tip.tip,
      locale,
      category: "core-docent",
      priority: 65,
      source: { kind: "tts" },
      interruptible: true,
      resumePolicy: "resume",
      report: { placeId: narrationStop.id, placeName: narrationStop.name, include: true },
    });
  }

  function handleOpenTip(tip: CampusTourSegmentInfo["tips"][number]) {
    recordTipViewed(
      `${narrationStop?.id ?? "unknown"}:${tip.name}:${locale}`,
      tip.tip,
      narrationStop?.id,
      narrationStop?.name,
    );
  }

  function handleListenNearby(spot: CampusTourNearbySpot) {
    const text = spot.docentText || spot.description;
    if (!text) return;
    const hasReviewedKoreanDocent = Boolean(spot.docentText) && /[가-힣]/.test(text);
    void speak({
      id: `tour-nearby:${spot.id}:${locale}:${Date.now()}`,
      text,
      locale: hasReviewedKoreanDocent ? "ko" : locale,
      category: hasReviewedKoreanDocent ? "core-docent" : "location-docent",
      priority: 65,
      source: hasReviewedKoreanDocent
        ? { kind: "asset", assetId: `core-docent:${spot.id}:ko` }
        : { kind: "tts" },
      interruptible: true,
      resumePolicy: "resume",
      report: { placeId: spot.id, placeName: spot.name, include: true },
    });
  }

  useEffect(() => () => {
    clearCategory("core-docent");
    clearCategory("location-docent");
  }, [clearCategory]);

  return (
    <MobileShell className="bg-surface">
      <main className="relative min-h-dvh overflow-hidden bg-map">
        <TourMapBackground
          center={mapCenter}
          currentStop={currentStop}
          nextStop={nextStop}
          remainingSegments={currentSegment}
          recenterUserLocationToken={recenterUserLocationToken}
        />
        <div className="absolute inset-x-4 top-6 z-20">
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              aria-label={t("tour.back")}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-surface/95 text-ink shadow-card backdrop-blur-sm"
              onClick={() => router.back()}
            >
              <ChevronLeft size={25} />
            </button>
            <div className="min-w-0 flex-1">
              <TourStopIndicator
                currentStop={currentStop}
                nextStop={nextStop}
                remainingDistanceMeters={remainingDistance}
                hasArrived={canAdvance}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col items-end gap-3">
            <TourSettingsMenu />
            <FloatingButton
              icon={<LocateFixed size={21} />}
              label={t("map.recenter")}
              variant="soft"
              disabled={!userLocation}
              onClick={() => setRecenterUserLocationToken((token) => token + 1)}
              className="disabled:opacity-45"
            />
          </div>
        </div>
        <AiTourSheet
          currentStop={currentStop}
          nextStop={nextStop}
          isLastStop={isLastStop}
          onNext={handleNext}
          onPrev={handlePrev}
          hasPrev={currentStopIndex > 0}
          nearbySpots={nearbySpots}
          isNearbyLoading={isNearbyLoading}
          addingSpotId={addingSpotId}
          onAddWaypoint={handleAddWaypoint}
          onListenTip={handleListenTip}
          onOpenTip={handleOpenTip}
          onListenNearby={handleListenNearby}
          segmentInfo={segmentInfo}
          isSegmentLoading={isSegmentLoading}
          hasArrived={canAdvance}
          needsArrivalConfirmation={needsArrivalConfirmation}
          remainingDistanceMeters={remainingDistance}
        />
        {isOffRouteDialogOpen && (
          <div
            className="absolute inset-0 z-50 grid place-items-center bg-black/45 px-6"
            role="presentation"
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="off-route-dialog-title"
              aria-describedby="off-route-dialog-description"
              className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-card"
            >
              <h2 id="off-route-dialog-title" className="text-xl font-extrabold text-ink">
                경로를 벗어났습니다
              </h2>
              <p id="off-route-dialog-description" className="mt-3 text-sm leading-6 text-muted-foreground">
                안내 경로에서 15m 이상 벗어났습니다. 지도에서 경로를 확인해 주세요.
              </p>
              <button
                type="button"
                autoFocus
                className="mt-6 h-12 w-full rounded-2xl bg-primary font-bold text-white"
                onClick={() => setIsOffRouteDialogOpen(false)}
              >
                확인
              </button>
            </div>
          </div>
        )}
      </main>
    </MobileShell>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { CampusCoordinate } from "@/types";
import { clientDebug } from "@/lib/clientDebug";
import { resolveCampusLocation } from "@/lib/campusLocation";
import type { NaverMapMarker, NaverMapRoute } from "@/types/naver-map";

type NaverMapProps = {
  center: CampusCoordinate;
  zoom?: number;
  markers?: NaverMapMarker[];
  routes?: NaverMapRoute[];
  className?: string;
  interactive?: boolean;
  showUserLocation?: boolean;
  followUserLocation?: boolean;
  recenterUserLocationToken?: number;
  minZoom?: number;
  maxZoom?: number;
  onReady?: (map: naver.maps.Map) => void;
  onError?: (error: Error) => void;
  onLocationPermissionDenied?: () => void;
  onMarkerClick?: (markerId: string) => void;
};

type DeviceOrientationEventWithPermission = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type DeviceOrientationConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

type NaverMapWithMorph = naver.maps.Map & {
  morph: (
    center: naver.maps.LatLng,
    zoom: number,
    options: { duration: number; easing: string },
  ) => void;
};

let naverMapScriptPromise: Promise<void> | null = null;

function loadNaverMapScript(clientId: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available."));
  }

  if (window.naver?.maps) {
    return Promise.resolve();
  }

  if (naverMapScriptPromise) {
    return naverMapScriptPromise;
  }

  naverMapScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("naver-map-script") as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Naver Map failed to load.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = "naver-map-script";
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Naver Map failed to load."));
    document.head.appendChild(script);
  });

  return naverMapScriptPromise;
}



function createMarkerIcon(type: NaverMapMarker["type"] = "facility") {
  const markerColor = {
    current: "#2F80ED",
    campus: "#FF5A4F",
    destination: "#0F8A7A",
    facility: "#0F8A7A",
  }[type];
  const size = type === "current" ? 18 : 22;
  const glow = type === "current" ? "0 0 0 12px rgba(47,128,237,.18)," : "";

  return {
    content: `<div style="width:${size}px;height:${size}px;border-radius:9999px;border:4px solid white;background:${markerColor};box-shadow:${glow}0 4px 12px rgba(17,24,39,.18);"></div>`,
    anchor: new window.naver!.maps.Point(size / 2, size / 2),
  };
}

function createUserLocationIcon(heading: number | null) {
  const rotation = heading ?? 0;

  return {
    content: `
      <div style="position:relative;width:44px;height:44px;">
        <div style="
          position:absolute;
          left:50%;
          top:50%;
          width:30px;
          height:30px;
          transform:translate(-50%,-50%);
          border-radius:9999px;
          background:rgba(47,128,237,.16);
        "></div>
        <div style="
          position:absolute;
          left:50%;
          top:50%;
          width:0;
          height:0;
          transform:translate(-50%,-30px) rotate(${rotation}deg);
          transform-origin:50% 30px;
          border-left:7px solid transparent;
          border-right:7px solid transparent;
          border-bottom:18px solid #2F80ED;
          filter:drop-shadow(0 2px 3px rgba(17,24,39,.22));
        "></div>
        <div style="
          position:absolute;
          left:50%;
          top:50%;
          width:17px;
          height:17px;
          transform:translate(-50%,-50%);
          border-radius:9999px;
          border:4px solid white;
          background:#2F80ED;
          box-shadow:0 3px 10px rgba(17,24,39,.22);
        "></div>
      </div>
    `,
    anchor: new window.naver!.maps.Point(22, 22),
  };
}

function distanceBetweenPoints(first: CampusCoordinate, second: CampusCoordinate) {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearingBetweenPoints(first: CampusCoordinate, second: CampusCoordinate) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const toDegrees = (radians: number) => radians * 180 / Math.PI;
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
    - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function sampleDirectionArrows(path: CampusCoordinate[], spacingMeters: number) {
  if (path.length < 2) return [];

  const arrows: Array<{ position: CampusCoordinate; bearing: number }> = [];
  let distanceUntilArrow = spacingMeters / 2;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const segmentDistance = distanceBetweenPoints(start, end);
    if (segmentDistance <= 0) continue;

    let consumedDistance = 0;
    while (consumedDistance + distanceUntilArrow <= segmentDistance) {
      consumedDistance += distanceUntilArrow;
      const ratio = consumedDistance / segmentDistance;
      arrows.push({
        position: {
          lat: start.lat + (end.lat - start.lat) * ratio,
          lng: start.lng + (end.lng - start.lng) * ratio,
        },
        bearing: bearingBetweenPoints(start, end),
      });
      distanceUntilArrow = spacingMeters;
    }
    distanceUntilArrow -= segmentDistance - consumedDistance;
  }

  return arrows;
}

function createRouteArrowIcon(bearing: number, color: string) {
  return {
    content: `
      <div style="width:18px;height:18px;display:grid;place-items:center;transform:rotate(${bearing}deg);filter:drop-shadow(0 1px 1px rgba(17,24,39,.2));">
        <svg width="12" height="12" viewBox="0 0 15 15" aria-hidden="true">
          <path d="M7.5 1.5 L13.2 12.8 L7.5 9.7 L1.8 12.8 Z" fill="${color}" />
        </svg>
      </div>
    `,
    anchor: new window.naver!.maps.Point(9, 9),
  };
}

function getDeviceHeading(event: DeviceOrientationEventWithPermission) {
  if (typeof event.webkitCompassHeading === "number") {
    return event.webkitCompassHeading;
  }

  if (typeof event.alpha === "number") {
    return 360 - event.alpha;
  }

  return null;
}

export function NaverMap({
  center,
  zoom = 18,
  markers = [],
  routes = [],
  className,
  interactive = true,
  showUserLocation = true,
  followUserLocation = false,
  recenterUserLocationToken = 0,
  minZoom = 6,
  maxZoom = 21,
  onReady,
  onError,
  onLocationPermissionDenied,
  onMarkerClick,
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRefs = useRef<naver.maps.Marker[]>([]);
  const markerListenerRefs = useRef<unknown[]>([]);
  const routeRefs = useRef<naver.maps.Polyline[]>([]);
  const routeArrowMarkerRefs = useRef<naver.maps.Marker[]>([]);
  const userLocationMarkerRef = useRef<naver.maps.Marker | null>(null);
  const mapDragListenerRef = useRef<unknown | null>(null);
  const handledRecenterTokenRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userLocation, setUserLocation] = useState<CampusCoordinate | null>(null);
  const isFollowingUserRef = useRef(followUserLocation);
  const [heading, setHeading] = useState<number | null>(null);
  const [orientationPermissionRequested, setOrientationPermissionRequested] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom);
  initialCenterRef.current = center;
  initialZoomRef.current = zoom;

  useEffect(() => {
    let cancelled = false;

    if (!clientId) {
      setFailed(true);
      onError?.(new Error("Missing NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"));
      return;
    }

    loadNaverMapScript(clientId)
      .then(() => {
        if (cancelled || !containerRef.current || !window.naver?.maps) {
          return;
        }

        const map = new window.naver.maps.Map(containerRef.current, {
          center: new window.naver.maps.LatLng(
            initialCenterRef.current.lat,
            initialCenterRef.current.lng,
          ),
          zoom: initialZoomRef.current,
          minZoom,
          maxZoom,
          draggable: interactive,
          pinchZoom: interactive,
          scrollWheel: interactive,
          keyboardShortcuts: interactive,
          disableDoubleTapZoom: !interactive,
          disableDoubleClickZoom: !interactive,
          disableTwoFingerTapZoom: !interactive,
          mapDataControl: false,
          scaleControl: false,
          logoControl: false,
          zoomControl: false,
        });

        mapRef.current = map;
        mapDragListenerRef.current = window.naver.maps.Event.addListener(
          map,
          "dragstart",
          () => {
            isFollowingUserRef.current = false;
          },
        );
        setReady(true);
        onReady?.(map);

        const refreshMap = () => {
          map.refresh?.();
          map.setCenter(
            new window.naver!.maps.LatLng(
              initialCenterRef.current.lat,
              initialCenterRef.current.lng,
            ),
          );
        };

        window.requestAnimationFrame(refreshMap);
        window.setTimeout(refreshMap, 100);
        window.setTimeout(refreshMap, 500);

        resizeObserverRef.current = new ResizeObserver(refreshMap);
        resizeObserverRef.current.observe(containerRef.current);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setFailed(true);
          onError?.(error);
        }
      });

    return () => {
      cancelled = true;
      markerRefs.current.forEach((marker) => marker.setMap(null));
      markerListenerRefs.current.forEach((listener) => window.naver?.maps.Event.removeListener(listener));
      routeRefs.current.forEach((route) => route.setMap(null));
      routeArrowMarkerRefs.current.forEach((marker) => marker.setMap(null));
      userLocationMarkerRef.current?.setMap(null);
      if (mapDragListenerRef.current && window.naver?.maps.Event) {
        window.naver.maps.Event.removeListener(mapDragListenerRef.current);
      }
      resizeObserverRef.current?.disconnect();
      mapRef.current?.destroy?.();
      markerRefs.current = [];
      markerListenerRefs.current = [];
      routeRefs.current = [];
      routeArrowMarkerRefs.current = [];
      userLocationMarkerRef.current = null;
      mapDragListenerRef.current = null;
      mapRef.current = null;
    };
  }, [clientId, interactive, maxZoom, minZoom, onError, onReady]);

  useEffect(() => {
    if (!showUserLocation || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = resolveCampusLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }).coordinate;

        setUserLocation(prev => {
          const isFirstLocation = prev === null;
          if ((isFirstLocation || isFollowingUserRef.current) && mapRef.current && window.naver?.maps) {
            mapRef.current.setCenter(new window.naver.maps.LatLng(nextLocation.lat, nextLocation.lng));
          }
          return nextLocation;
        });

        const gpsHeading = position.coords.heading;
        if (typeof gpsHeading === "number" && gpsHeading >= 0) {
          setHeading((currentHeading) => {
            if (currentHeading === null) return gpsHeading;
            const delta = ((gpsHeading - currentHeading + 540) % 360) - 180;
            return currentHeading + delta * 0.5;
          });
        }
      },
      () => {
        // Keep the map usable even when the user denies GPS permission.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [showUserLocation]);

  useEffect(() => {
    isFollowingUserRef.current = followUserLocation;
  }, [followUserLocation]);

  useEffect(() => {
    if (recenterUserLocationToken <= handledRecenterTokenRef.current) {
      return;
    }

    handledRecenterTokenRef.current = recenterUserLocationToken;

    if (!userLocation) {
      if (!navigator.geolocation) {
        onLocationPermissionDenied?.();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = resolveCampusLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }).coordinate;
          setUserLocation(nextLocation);
          isFollowingUserRef.current = true;
          mapRef.current?.setZoom(18);
          if (mapRef.current && window.naver?.maps) {
            mapRef.current.setCenter(
              new window.naver.maps.LatLng(nextLocation.lat, nextLocation.lng),
            );
          }
        },
        () => onLocationPermissionDenied?.(),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
      return;
    }

    if (!mapRef.current || !window.naver?.maps) return;

    isFollowingUserRef.current = true;
    clientDebug("map", "recenter-requested", {
      token: recenterUserLocationToken,
      userLocation,
      zoomTarget: 18,
    });
    mapRef.current.setZoom(18);
    mapRef.current.setCenter(
      new window.naver.maps.LatLng(userLocation.lat, userLocation.lng),
    );
    clientDebug("map", "recenter-applied", { zoomTarget: 18 });
  }, [onLocationPermissionDenied, recenterUserLocationToken, userLocation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      const nextHeading = getDeviceHeading(event as DeviceOrientationEventWithPermission);

      if (nextHeading !== null) {
        setHeading((currentHeading) => {
          if (currentHeading === null) return nextHeading;
          const delta = ((nextHeading - currentHeading + 540) % 360) - 180;
          return currentHeading + delta * 0.5;
        });
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener("campus-map-request-orientation", requestOrientationPermission);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("campus-map-request-orientation", requestOrientationPermission);
    };
  }, [orientationPermissionRequested]);

  async function requestOrientationPermission() {
    if (orientationPermissionRequested || typeof window === "undefined") {
      return;
    }

    setOrientationPermissionRequested(true);

    const DeviceOrientation =
      window.DeviceOrientationEvent as DeviceOrientationConstructorWithPermission | undefined;

    if (DeviceOrientation?.requestPermission) {
      try {
        await DeviceOrientation.requestPermission();
      } catch {
        // Orientation is optional; the GPS marker still works without heading.
      }
    }
  }

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps) {
      return;
    }

    // 부드러운 애니메이션 효과를 위해 morph 사용
    (map as NaverMapWithMorph).morph(new window.naver.maps.LatLng(center.lat, center.lng), zoom, {
      duration: 1000,
      easing: "easeOutCubic",
    });
  }, [center.lat, center.lng, ready, zoom]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps) {
      return;
    }

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerListenerRefs.current.forEach((listener) => window.naver?.maps.Event.removeListener(listener));
    markerListenerRefs.current = [];
    markerRefs.current = markers.map(
      (marker) => {
        const mapMarker = new window.naver!.maps.Marker({
          map,
          title: marker.title,
          position: new window.naver!.maps.LatLng(marker.position.lat, marker.position.lng),
          icon: createMarkerIcon(marker.type),
          clickable: Boolean(onMarkerClick),
        });
        if (onMarkerClick) {
          markerListenerRefs.current.push(
            window.naver!.maps.Event.addListener(mapMarker, "click", () => onMarkerClick(marker.id)),
          );
        }
        return mapMarker;
      },
    );
  }, [markers, onMarkerClick, ready]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps) {
      return;
    }

    routeRefs.current.forEach((route) => route.setMap(null));
    routeArrowMarkerRefs.current.forEach((marker) => marker.setMap(null));
    routeRefs.current = routes.map(
      (route) =>
        new window.naver!.maps.Polyline({
          map,
          path: route.path.map((point) => new window.naver!.maps.LatLng(point.lat, point.lng)),
          strokeColor: route.strokeColor ?? "#0F8A7A",
          strokeWeight: route.strokeWeight ?? 5,
          strokeOpacity: route.strokeOpacity ?? 0.95,
        }),
    );
    routeArrowMarkerRefs.current = routes.flatMap((route) => {
      if (!route.showDirectionArrows) return [];
      return sampleDirectionArrows(route.path, route.arrowSpacingMeters ?? 24).map(
        (arrow) => new window.naver!.maps.Marker({
          map,
          position: new window.naver!.maps.LatLng(arrow.position.lat, arrow.position.lng),
          icon: createRouteArrowIcon(arrow.bearing, route.arrowColor ?? "#FFFFFF"),
          clickable: false,
          zIndex: 20,
        }),
      );
    });
  }, [ready, routes]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps || !showUserLocation || !userLocation) {
      return;
    }

    const position = new window.naver.maps.LatLng(userLocation.lat, userLocation.lng);

    if (!userLocationMarkerRef.current) {
      userLocationMarkerRef.current = new window.naver.maps.Marker({
        map,
        position,
        title: "현재 위치",
        icon: createUserLocationIcon(heading),
      });
      return;
    }

    userLocationMarkerRef.current.setPosition(position);
    userLocationMarkerRef.current.setIcon(createUserLocationIcon(heading));
  }, [heading, ready, showUserLocation, userLocation]);

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden bg-map", className)}
      onPointerDown={requestOrientationPermission}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 size-full"
      />
    </div>
  );
}

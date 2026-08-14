"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { CampusCoordinate } from "@/types";
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
  minZoom?: number;
  maxZoom?: number;
  onReady?: (map: naver.maps.Map) => void;
  onError?: (error: Error) => void;
};

type DeviceOrientationEventWithPermission = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type DeviceOrientationConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
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

function StaticFallbackMap() {
  return (
    <div className="absolute inset-0 bg-map">
      <div className="absolute inset-0 opacity-80">
        <div className="absolute left-[-14%] top-[48%] h-20 w-[130%] -rotate-[18deg] bg-white" />
        <div className="absolute left-[62%] top-[-4%] h-[112%] w-16 rotate-[15deg] bg-white" />
        <div className="absolute left-[14%] top-[17%] h-12 w-14 rounded border border-line bg-surface" />
        <div className="absolute left-[49%] top-[23%] h-11 w-16 rounded border border-line bg-surface" />
        <div className="absolute left-[20%] top-[43%] h-14 w-[74px] rounded border border-line bg-surface" />
        <div className="absolute bottom-[8%] right-[12%] h-28 w-[92px] rounded border border-line bg-map-building" />
      </div>
    </div>
  );
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
  zoom = 16,
  markers = [],
  routes = [],
  className,
  interactive = true,
  showUserLocation = true,
  followUserLocation = false,
  minZoom = 6,
  maxZoom = 21,
  onReady,
  onError,
}: NaverMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRefs = useRef<naver.maps.Marker[]>([]);
  const routeRefs = useRef<naver.maps.Polyline[]>([]);
  const userLocationMarkerRef = useRef<naver.maps.Marker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userLocation, setUserLocation] = useState<CampusCoordinate | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [orientationPermissionRequested, setOrientationPermissionRequested] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

  const stableCenter = useMemo(() => center, [center.lat, center.lng]);

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
          center: new window.naver.maps.LatLng(stableCenter.lat, stableCenter.lng),
          zoom,
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
        setReady(true);
        onReady?.(map);

        const refreshMap = () => {
          map.refresh?.();
          map.setCenter(new window.naver!.maps.LatLng(stableCenter.lat, stableCenter.lng));
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
      routeRefs.current.forEach((route) => route.setMap(null));
      userLocationMarkerRef.current?.setMap(null);
      resizeObserverRef.current?.disconnect();
      mapRef.current?.destroy?.();
      markerRefs.current = [];
      routeRefs.current = [];
      userLocationMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [clientId, interactive, maxZoom, minZoom, onError, onReady, stableCenter, zoom]);

  useEffect(() => {
    if (!showUserLocation || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(prev => {
          const isFirstLocation = prev === null;
          if ((isFirstLocation || followUserLocation) && mapRef.current && window.naver?.maps) {
            mapRef.current.setCenter(new window.naver.maps.LatLng(nextLocation.lat, nextLocation.lng));
          }
          return nextLocation;
        });
      },
      () => {
        // Keep the map usable even when the user denies GPS permission.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [followUserLocation, showUserLocation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      const nextHeading = getDeviceHeading(event as DeviceOrientationEventWithPermission);

      if (nextHeading !== null) {
        setHeading(nextHeading);
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

    map.setCenter(new window.naver.maps.LatLng(center.lat, center.lng));
    map.setZoom(zoom);
  }, [center.lat, center.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps) {
      return;
    }

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = markers.map(
      (marker) =>
        new window.naver!.maps.Marker({
          map,
          title: marker.title,
          position: new window.naver!.maps.LatLng(marker.position.lat, marker.position.lng),
          icon: createMarkerIcon(marker.type),
        }),
    );
  }, [markers, ready]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !window.naver?.maps) {
      return;
    }

    routeRefs.current.forEach((route) => route.setMap(null));
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
      <StaticFallbackMap />
      <div
        ref={containerRef}
        className={cn("absolute inset-0 z-0 size-full", failed && "opacity-0")}
      />
    </div>
  );
}

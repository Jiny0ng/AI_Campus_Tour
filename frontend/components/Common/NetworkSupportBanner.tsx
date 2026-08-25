"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Wifi } from "lucide-react";
import { CampusWifiHelpModal } from "@/components/Common/CampusWifiHelpModal";
import { campusWifi } from "@/config/campusWifi";
import { campusCenter } from "@/constants/campus";
import { useAudioGuide } from "@/contexts/AudioGuideContext";

const SESSION_KEY = "campus-wifi-auto-shown";
const DISMISS_KEY = "campus-wifi-dismissed-version";

function meters(first: GeolocationCoordinates, second: { latitude: number; longitude: number }) {
  const radius = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const lat = radians(second.latitude - first.latitude);
  const lng = radians(second.longitude - first.longitude);
  const value = Math.sin(lat / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(lng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function NetworkSupportBanner() {
  const { status } = useAudioGuide();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const originRef = useRef<{ latitude: number; longitude: number; at: number } | null>(null);

  useEffect(() => {
    if (!campusWifi.enabled || status.network === "online" || !navigator.geolocation) return;
    const isCar = new URLSearchParams(window.location.search).get("mode") === "car";
    const watchId = navigator.geolocation.watchPosition((position) => {
      const nearCampus = meters(position.coords, {
        latitude: campusCenter.lat,
        longitude: campusCenter.lng,
      }) <= 1_500;
      if (!nearCampus || isCar) return;
      const previous = originRef.current;
      if (!previous) {
        originRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          at: Date.now(),
        };
        return;
      }
      const stationaryForTenSeconds = Date.now() - previous.at >= 10_000
        && meters(position.coords, previous) < 10;
      if (!stationaryForTenSeconds && meters(position.coords, previous) >= 10) {
        originRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          at: Date.now(),
        };
      }
      if (
        stationaryForTenSeconds
        && sessionStorage.getItem(SESSION_KEY) !== "true"
        && localStorage.getItem(DISMISS_KEY) !== campusWifi.updatedAt
      ) {
        sessionStorage.setItem(SESSION_KEY, "true");
        setOpen(true);
      }
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [status.network]);

  if (status.network === "online" || !campusWifi.enabled) return null;
  return (
    <>
      <div className={`pointer-events-auto fixed left-1/2 z-[85] flex w-[min(calc(100%-24px),406px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-card ${pathname.startsWith("/guide") ? "top-[218px]" : "top-14"}`}>
        <span className="min-w-0 flex-1">연결이 불안정해 텍스트 안내를 우선합니다.</span>
        <button type="button" className="flex shrink-0 items-center gap-1 text-primary" onClick={() => setOpen(true)}>
          <Wifi size={14} /> Wi-Fi 안내
        </button>
      </div>
      <CampusWifiHelpModal
        open={open}
        onClose={() => setOpen(false)}
        onDismissPermanently={() => {
          localStorage.setItem(DISMISS_KEY, campusWifi.updatedAt);
          setOpen(false);
        }}
      />
    </>
  );
}

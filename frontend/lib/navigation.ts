import type { GuidePlace } from "@/types";

export type TransportModeValue = "walk" | "car" | "shuttle";

export function createRoutePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - 18;

  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

export function getTransportMinutes(distanceMeters: number, mode: TransportModeValue) {
  if (mode === "car") {
    return Math.max(3, Math.round(distanceMeters / 120));
  }

  if (mode === "shuttle") {
    return Math.max(8, Math.round(distanceMeters / 35));
  }

  return Math.max(3, Math.round(distanceMeters / 40));
}

export function getTransportLabel(mode: TransportModeValue) {
  if (mode === "car") {
    return "차량";
  }

  if (mode === "shuttle") {
    return "순환버스";
  }

  return "도보";
}

export function getArrivalTime(minutesFromNow: number) {
  const arrival = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const hours = String(arrival.getHours()).padStart(2, "0");
  const minutes = String(arrival.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function getRouteSummary(destination: GuidePlace, mode: TransportModeValue) {
  const minutes = getTransportMinutes(destination.distanceMeters, mode);

  return {
    minutes,
    modeLabel: getTransportLabel(mode),
    arrivalTime: getArrivalTime(minutes),
    remainingDistance: `${Math.max(destination.distanceMeters, 120)}m 남음`,
  };
}

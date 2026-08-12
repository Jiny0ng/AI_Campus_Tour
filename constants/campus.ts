import type { CampusCoordinate } from "@/types";

export const campusCenter: CampusCoordinate = {
  lat: 35.8469,
  lng: 127.1297,
};

export const DEFAULT_MAP_ZOOM = 16;

export const JEONBUK_UNIVERSITY = {
  id: "jeonbuk-university",
  name: "전북대학교 전주캠퍼스",
  address: "전북특별자치도 전주시 덕진구 백제대로 567",
  coordinate: campusCenter,
} as const;

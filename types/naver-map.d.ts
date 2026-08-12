import type { CampusCoordinate } from "./campus";

declare global {
  interface Window {
    naver?: {
      maps: {
        LatLng: typeof naver.maps.LatLng;
        Point: typeof naver.maps.Point;
        Map: typeof naver.maps.Map;
        Marker: typeof naver.maps.Marker;
        Polyline: typeof naver.maps.Polyline;
      };
    };
  }

  namespace naver.maps {
    class LatLng {
      constructor(lat: number, lng: number);
    }

    class Point {
      constructor(x: number, y: number);
    }

    class Map {
      constructor(element: HTMLElement | string, options?: MapOptions);
      setCenter(center: LatLng): void;
      setZoom(zoom: number): void;
      refresh?(): void;
      destroy?(): void;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
      setIcon(icon: MarkerOptions["icon"]): void;
    }

    class Polyline {
      constructor(options: PolylineOptions);
      setMap(map: Map | null): void;
    }

    type MapOptions = {
      center?: LatLng;
      zoom?: number;
      minZoom?: number;
      maxZoom?: number;
      draggable?: boolean;
      pinchZoom?: boolean;
      scrollWheel?: boolean;
      keyboardShortcuts?: boolean;
      disableDoubleTapZoom?: boolean;
      disableDoubleClickZoom?: boolean;
      disableTwoFingerTapZoom?: boolean;
      mapDataControl?: boolean;
      scaleControl?: boolean;
      logoControl?: boolean;
      zoomControl?: boolean;
    };

    type MarkerOptions = {
      position: LatLng;
      map?: Map;
      title?: string;
      icon?: {
        content: string;
        anchor?: Point;
      };
    };

    type PolylineOptions = {
      map?: Map;
      path: LatLng[];
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      strokeStyle?: string;
    };
  }
}

export type NaverMapMarkerType = "current" | "campus" | "destination" | "facility";

export type NaverMapMarker = {
  id: string;
  title?: string;
  position: CampusCoordinate;
  type?: NaverMapMarkerType;
};

export type NaverMapRoute = {
  id: string;
  path: CampusCoordinate[];
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
};

export type NaverMapGeoJson = {
  id: string;
  data: Record<string, unknown>;
};

export {};

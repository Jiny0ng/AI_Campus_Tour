import { CampusMap } from "@/components/Map";
import { MobileShell } from "@/components/Layout";
import { DEFAULT_MAP_ZOOM, JEONBUK_UNIVERSITY } from "@/constants/campus";
import type { CampusCoordinate, HomeServiceOption } from "@/types";
import { HomeBrandBadge } from "./HomeBrandBadge";
import { HomeServiceSheet } from "./HomeServiceSheet";

type HomeScreenProps = {
  campus?: typeof JEONBUK_UNIVERSITY;
  serviceOptions: HomeServiceOption[];
  currentLocation?: CampusCoordinate;
};

export function HomeScreen({
  campus = JEONBUK_UNIVERSITY,
  serviceOptions,
}: HomeScreenProps) {
  return (
    <MobileShell className="bg-surface">
      <CampusMap
        center={campus.coordinate}
        zoom={DEFAULT_MAP_ZOOM}
        className="min-h-dvh"
      >
        <div className="pointer-events-auto absolute left-4 top-14">
          <HomeBrandBadge />
        </div>
        <HomeServiceSheet options={serviceOptions} />
      </CampusMap>
    </MobileShell>
  );
}

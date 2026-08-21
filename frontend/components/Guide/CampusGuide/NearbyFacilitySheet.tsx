import { MapPin, Navigation } from "lucide-react";
import { BottomSheet } from "@/components/Common";
import type { GuidePlace } from "@/types";

type NearbyFacilitySheetProps = {
  places: GuidePlace[];
  onSelectPlace: (place: GuidePlace) => void;
};

export function NearbyFacilitySheet({ places, onSelectPlace }: NearbyFacilitySheetProps) {
  return (
    <BottomSheet
      showHandle={false}
      className="pointer-events-auto rounded-t-[18px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
    >
      <h2 className="text-lg font-extrabold text-ink">많이 찾는 장소</h2>
      <p className="mt-1 text-xs font-medium text-muted">학생들이 자주 이용하는 목적지예요.</p>
      <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place)}
            className="w-[210px] shrink-0 rounded-card border border-line bg-surface p-4 text-left shadow-card transition active:scale-[0.99]"
          >
            <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
              <MapPin size={18} />
            </span>
            <span className="mt-3 block truncate text-sm font-extrabold text-ink">{place.name}</span>
            <span className="mt-1 line-clamp-2 h-8 text-xs font-medium text-muted">
              {place.description}
            </span>
            <span className="mt-3 flex items-center gap-1 text-xs font-bold text-primary">
              <Navigation size={13} /> 약 {place.distanceMeters}m
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

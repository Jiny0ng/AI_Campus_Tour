import { ChevronRight, MapPin } from "lucide-react";
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
      <h2 className="text-lg font-extrabold text-ink">주변 시설 (300m 이내)</h2>
      <div className="mt-4 space-y-2.5">
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place)}
            className="flex min-h-[58px] w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left shadow-card transition active:scale-[0.99]"
          >
            <MapPin size={18} className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold text-ink">{place.name}</span>
              <span className="mt-0.5 block truncate text-xs font-medium text-muted">
                {place.description}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

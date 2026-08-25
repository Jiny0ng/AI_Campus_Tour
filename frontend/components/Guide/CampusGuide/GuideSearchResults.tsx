import { MapPin } from "lucide-react";
import type { GuidePlace } from "@/types";
import { useAppSettings } from "@/contexts/AppSettingsContext";

type GuideSearchResultsProps = {
  places: GuidePlace[];
  onSelectPlace: (place: GuidePlace) => void;
};

export function GuideSearchResults({ places, onSelectPlace }: GuideSearchResultsProps) {
  const { pn } = useAppSettings();
  if (places.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 overflow-hidden rounded-card border border-line bg-surface shadow-floating">
      {places.slice(0, 5).map((place) => (
        <button
          key={place.id}
          type="button"
          onClick={() => onSelectPlace(place)}
          className="flex h-11 w-full items-center gap-2 border-b border-line px-4 text-left last:border-b-0"
        >
          <MapPin size={15} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{pn(place.name)}</span>
        </button>
      ))}
    </div>
  );
}

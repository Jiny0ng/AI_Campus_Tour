import { MapPin, Navigation } from "lucide-react";
import { BottomSheet, Button } from "@/components/Common";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import type { GuidePlace, GuidePurpose } from "@/types";

type NearbyFacilitySheetProps = {
  places: GuidePlace[];
  selectedPlace: GuidePlace | null;
  selectedPurpose: GuidePurpose | null;
  onSelectPlace: (place: GuidePlace) => void;
  onGuidePlace: (place: GuidePlace) => void;
};

export function NearbyFacilitySheet({ places, selectedPlace, selectedPurpose, onSelectPlace, onGuidePlace }: NearbyFacilitySheetProps) {
  const { t, pn } = useAppSettings();
  const title = selectedPurpose ? t(`guide.purpose.${selectedPurpose}`) : t("guide.popular.title");
  const parkingOnly = selectedPurpose === "parking";

  return (
    <BottomSheet
      freeDrag
      showHandle
      minVisibleHeightVh={16}
      initialHeightVh={selectedPurpose ? 35 : 24}
      maxHeightVh={65}
      className="pointer-events-auto rounded-t-[18px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3"
      contentClassName="min-h-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-ink">{selectedPlace ? pn(selectedPlace.name) : title}</h2>
          {!parkingOnly ? <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-5 text-muted">
            {selectedPlace?.description || t("guide.popular.description")}
          </p> : null}
        </div>
        {selectedPlace ? (
          <Button type="button" size="sm" className="h-9 shrink-0 rounded-full px-3 text-xs" onClick={() => onGuidePlace(selectedPlace)}>
            <Navigation size={14} /> {t("guide.direct")}
          </Button>
        ) : null}
      </div>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
        {places.map((place) => (
          <article
            key={place.id}
            className={`w-[300px] shrink-0 rounded-card border bg-surface px-3 py-2.5 shadow-card ${selectedPlace?.id === place.id ? "border-primary" : "border-line"}`}
          >
            <div className="flex items-start gap-2.5">
              <button type="button" aria-label={pn(place.name)} onClick={() => onSelectPlace(place)} className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <MapPin size={16} />
              </button>
              <button type="button" onClick={() => onSelectPlace(place)} className="min-w-0 flex-1 text-left">
                <span className="line-clamp-2 text-sm font-extrabold leading-5 text-ink">{pn(place.name)}</span>
                {!parkingOnly ? <span className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-muted">{place.description}</span> : null}
              </button>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span className="text-[11px] font-extrabold text-primary">{place.distanceMeters}m</span>
                <button type="button" onClick={() => onGuidePlace(place)} className="h-7 rounded-full bg-primary px-2.5 text-[10px] font-extrabold text-white">
                  {t("guide.direct")}
                </button>
              </div>
            </div>
          </article>
        ))}
        {places.length === 0 ? (
          <p className="w-full py-5 text-center text-xs font-medium text-muted">{t("guide.noPurposeResults")}</p>
        ) : null}
      </div>
      {!parkingOnly && selectedPlace && ((selectedPlace.facilities?.length || 0) > 0 || (selectedPlace.facts?.length || 0) > 0) ? (
        <div className="mt-3 border-t border-line pt-3">
          <h3 className="text-sm font-extrabold text-ink">{t("guide.details")}</h3>
          <div className="mt-2 grid gap-2">
            {selectedPlace.facilities?.slice(0, 4).map((facility) => (
              <p key={facility.id} className="rounded-card bg-primary-soft px-3 py-2 text-xs font-medium leading-5 text-ink/80">
                {[facility.floor, facility.name, facility.features || facility.note].filter(Boolean).join(" · ")}
              </p>
            ))}
            {selectedPlace.facts?.slice(0, 2).map((fact) => (
              <p key={fact.id} className="rounded-card bg-white px-3 py-2 text-xs font-medium leading-5 text-ink/80 shadow-sm">{fact.content}</p>
            ))}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

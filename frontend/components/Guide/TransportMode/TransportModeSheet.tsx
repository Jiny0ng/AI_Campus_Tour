"use client";

import { Button, BottomSheet } from "@/components/Common";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import type { GuidePlace } from "@/types";
import { TransportMode, TransportOption, TransportOptionGroup } from "./TransportOptionGroup";

type TransportModeSheetProps = {
  destination: GuidePlace;
  options: TransportOption[];
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  onStart: () => void;
};

export function TransportModeSheet({
  destination,
  options,
  selectedMode,
  onSelectMode,
  onStart,
}: TransportModeSheetProps) {
  const { t } = useAppSettings();

  return (
    <BottomSheet
      showHandle={false}
      className="pointer-events-auto max-h-[42dvh] overflow-y-auto rounded-t-[18px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4"
    >
      <p className="text-xs font-extrabold text-primary">{t("guide.destination")}</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-8 text-ink">{destination.name}</h1>
      <h2 className="mt-4 text-lg font-extrabold text-ink">{t("guide.transport.title")}</h2>
      <div className="mt-3">
        <TransportOptionGroup
          options={options}
          selectedMode={selectedMode}
          onSelectMode={onSelectMode}
        />
      </div>
      <Button type="button" size="lg" fullWidth className="mt-4" onClick={onStart}>
        {t(`guide.start.${selectedMode}`)}
      </Button>
    </BottomSheet>
  );
}

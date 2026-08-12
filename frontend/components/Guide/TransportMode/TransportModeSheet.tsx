"use client";

import { Button, BottomSheet } from "@/components/Common";
import type { GuidePlace } from "@/types";
import { TransportMode, TransportOption, TransportOptionGroup } from "./TransportOptionGroup";

type TransportModeSheetProps = {
  destination: GuidePlace;
  options: TransportOption[];
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  onStart: () => void;
};

const startButtonLabel = {
  walk: "도보 안내 시작하기",
  car: "차량 안내 시작하기",
  shuttle: "순환버스 안내 시작하기",
};

export function TransportModeSheet({
  options,
  selectedMode,
  onSelectMode,
  onStart,
}: TransportModeSheetProps) {
  return (
    <BottomSheet
      showHandle={false}
      className="pointer-events-auto rounded-t-[18px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4"
    >
      <h1 className="text-lg font-extrabold text-ink">어떻게 이동하시겠어요?</h1>
      <div className="mt-4">
        <TransportOptionGroup
          options={options}
          selectedMode={selectedMode}
          onSelectMode={onSelectMode}
        />
      </div>
      <Button type="button" size="lg" fullWidth className="mt-4" onClick={onStart}>
        {startButtonLabel[selectedMode]}
      </Button>
    </BottomSheet>
  );
}

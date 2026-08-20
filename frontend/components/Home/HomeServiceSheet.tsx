"use client";

import { Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/Common";
import type { HomeServiceOption } from "@/types";
import { HomeServiceOptionCard } from "./HomeServiceOptionCard";
import { useAppSettings } from "@/contexts/AppSettingsContext";

type HomeServiceSheetProps = {
  options: HomeServiceOption[];
};

export function HomeServiceSheet({ options }: HomeServiceSheetProps) {
  const { t } = useAppSettings();
  return (
    <BottomSheet className="pointer-events-auto px-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
      <div className="space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <Sparkles size={17} />
            <span>Campus Guide</span>
          </p>
          <h1 className="mt-3 whitespace-pre-line text-xl font-extrabold leading-7 text-ink">
            {t("home.prompt")}
          </h1>
        </div>

        <div className="space-y-2">
          {options.map((option) => (
            <HomeServiceOptionCard key={option.id} option={option} />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

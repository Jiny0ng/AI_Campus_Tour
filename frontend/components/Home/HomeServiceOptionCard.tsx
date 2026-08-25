"use client";

import Link from "next/link";
import { ArrowRight, Map, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HomeServiceOption } from "@/types";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { useAudioGuide } from "@/contexts/AudioGuideContext";

type HomeServiceOptionCardProps = {
  option: HomeServiceOption;
};

const serviceIcon = {
  tour: Map,
  guide: MapPin,
};

export function HomeServiceOptionCard({ option }: HomeServiceOptionCardProps) {
  const { t } = useAppSettings();
  const { unlock } = useAudioGuide();
  const active = option.id === "tour";
  const Icon = serviceIcon[option.id];

  return (
    <Link
      href={option.href}
      onPointerDown={() => {
        if (active) void unlock();
      }}
      className={cn(
        "flex h-[57px] items-center gap-3 rounded-card border bg-surface px-3 transition active:scale-[0.99]",
        active ? "border-primary bg-primary-soft" : "border-line",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          active ? "bg-primary text-white" : "bg-page text-ink",
        )}
      >
        <Icon size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">
          {t(`home.${option.id}.title`)}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-muted">
          {t(`home.${option.id}.description`)}
        </span>
      </span>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          active ? "bg-primary text-white" : "bg-page text-ink",
        )}
      >
        <ArrowRight size={18} />
      </span>
    </Link>
  );
}

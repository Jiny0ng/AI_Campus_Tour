"use client";

import { Bike, Car, Footprints } from "lucide-react";
import { cn } from "@/lib/cn";

export type TransportMode = "walk" | "bike" | "car";

export type TransportOption = {
  id: TransportMode;
  label: string;
  minutes: number;
};

type TransportOptionGroupProps = {
  options: TransportOption[];
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
};

const iconMap = {
  walk: Footprints,
  car: Car,
  bike: Bike,
};

export function TransportOptionGroup({
  options,
  selectedMode,
  onSelectMode,
}: TransportOptionGroupProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((option) => {
        const selected = option.id === selectedMode;
        const Icon = iconMap[option.id];

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelectMode(option.id)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-full border bg-surface text-center transition active:scale-[0.98]",
              selected
                ? "border-primary bg-primary-soft text-primary shadow-card"
                : "border-line text-ink shadow-card",
            )}
          >
            <Icon size={24} className={selected ? "text-primary" : "text-muted"} />
            <span className="mt-2 text-sm font-extrabold">{option.label}</span>
            <span className="mt-0.5 text-xs font-bold">{option.minutes}분</span>
          </button>
        );
      })}
    </div>
  );
}

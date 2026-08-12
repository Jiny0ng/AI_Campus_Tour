import { BookOpen, Bus, Lightbulb } from "lucide-react";
import type { TourSummaryTip } from "@/types";

type TourSummaryTipCardProps = {
  tip: TourSummaryTip;
};

const iconMap = {
  lightbulb: Lightbulb,
  bus: Bus,
  book: BookOpen,
};

export function TourSummaryTipCard({ tip }: TourSummaryTipCardProps) {
  const Icon = iconMap[tip.icon];

  return (
    <article className="flex min-h-[58px] items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-extrabold text-ink">{tip.title}</h3>
        <p className="mt-0.5 truncate text-xs font-medium text-muted">{tip.description}</p>
      </div>
    </article>
  );
}

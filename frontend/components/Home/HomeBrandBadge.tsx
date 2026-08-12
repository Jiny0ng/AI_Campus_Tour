import { GraduationCap } from "lucide-react";

type HomeBrandBadgeProps = {
  label?: string;
};

export function HomeBrandBadge({ label = "JBNU" }: HomeBrandBadgeProps) {
  return (
    <div className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-3 text-xs font-bold text-ink shadow-card backdrop-blur">
      <GraduationCap size={15} className="text-primary" />
      <span>{label}</span>
    </div>
  );
}

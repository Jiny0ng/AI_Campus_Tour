import type { Facility } from "@/types";

type FacilityCardProps = {
  facility: Facility;
};

export function FacilityCard({ facility }: FacilityCardProps) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{facility.name}</h3>
      <p className="mt-1 text-xs text-muted">{facility.category}</p>
    </article>
  );
}

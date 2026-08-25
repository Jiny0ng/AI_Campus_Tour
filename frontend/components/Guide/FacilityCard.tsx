import type { Facility } from "@/types";
import { useAppSettings } from "@/contexts/AppSettingsContext";

type FacilityCardProps = {
  facility: Facility;
};

export function FacilityCard({ facility }: FacilityCardProps) {
  const { pn } = useAppSettings();
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{pn(facility.name)}</h3>
      <p className="mt-1 text-xs text-muted">{facility.category}</p>
    </article>
  );
}

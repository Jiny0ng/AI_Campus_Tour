import type { Building } from "@/types";

type SearchResultItemProps = {
  building: Building;
};

export function SearchResultItem({ building }: SearchResultItemProps) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{building.name}</h3>
      <p className="mt-1 text-xs text-muted">{building.description}</p>
    </article>
  );
}

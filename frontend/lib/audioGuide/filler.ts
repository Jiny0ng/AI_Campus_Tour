export type FillerEntry = {
  id: string;
  locale: string;
  text: string;
  weight: number;
  assetId: string;
};

export function selectFiller(
  entries: FillerEntry[],
  locale: string,
  recentIds: string[],
  random = Math.random,
) {
  const candidates = entries.filter((entry) => (
    entry.locale === locale && !recentIds.slice(-3).includes(entry.id)
  ));
  const total = candidates.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;
  let cursor = random() * total;
  for (const entry of candidates) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry;
  }
  return candidates.at(-1) ?? null;
}


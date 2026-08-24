import type { NetworkQuality } from "@/types/audioGuide";

/**
 * `realtime-tts` includes model synthesis time, not just network latency.  It
 * is retained for diagnostics but must not make the whole application appear
 * offline.
 */
export type NetworkSample = {
  ttfbMs: number;
  ok: boolean;
  at: number;
  source?: "api" | "health" | "asset-cache" | "realtime-tts";
  affectsQuality?: boolean;
};

export function nextNetworkQuality(
  current: NetworkQuality,
  samples: NetworkSample[],
  browserOnline: boolean,
): NetworkQuality {
  if (!browserOnline) return "text-only";
  const recent = samples.filter((sample) => sample.affectsQuality !== false).slice(-5);
  const lastTwo = recent.slice(-2);
  const slowOrFailed = lastTwo.length === 2 && lastTwo.every((sample) => (
    !sample.ok || sample.ttfbMs > 3_000
  ));
  const failuresInThirtySeconds = recent.filter((sample) => (
    !sample.ok && Date.now() - sample.at <= 30_000
  )).length;
  if (current === "degraded" && lastTwo.length === 2 && lastTwo.every((sample) => !sample.ok)) {
    return "text-only";
  }
  if ((current === "degraded" || current === "text-only") && recent.length >= 1 && recent.at(-1)?.ok) {
    return "recovering";
  }
  if ((current === "recovering" || current === "degraded") && recent.length >= 3) {
    const recovered = recent.slice(-3).every((sample) => sample.ok && sample.ttfbMs <= 2_000);
    if (recovered) return "online";
  }
  if (slowOrFailed || failuresInThirtySeconds >= 2) return "degraded";
  return current;
}

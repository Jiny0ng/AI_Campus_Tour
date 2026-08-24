import type { AudioRequest } from "@/types/audioGuide";

const localeMap = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "cmn-CN",
} as const;

export function audioCacheKey(request: AudioRequest) {
  return [request.source.kind, request.source.kind === "asset" ? request.source.assetId : request.text, request.locale, request.category].join("|");
}

export async function fetchAudio(
  request: AudioRequest,
  signal: AbortSignal,
  allowAssetSynthesisFallback = true,
) {
  const startedAt = performance.now();
  let source: "asset-cache" | "realtime-tts" = request.source.kind === "asset"
    ? "asset-cache"
    : "realtime-tts";
  let response = request.source.kind === "asset"
    ? await fetch(`/api/tts/assets/${encodeURIComponent(request.source.assetId)}`, { signal })
    : await synthesize(request, signal);
  // A manifest can lag behind a content deployment. Preserve guidance by using
  // the same reviewed text through the shared synthesis endpoint.
  if (!response.ok && request.source.kind === "asset" && allowAssetSynthesisFallback) {
    source = "realtime-tts";
    response = await synthesize(request, signal);
  }
  const ttfbMs = performance.now() - startedAt;
  if (!response.ok) throw Object.assign(new Error("Audio request failed"), { ttfbMs });
  // A synth cache miss waits for model generation. That duration is not a
  // network-quality signal; a cache hit or static asset request is.
  const cacheStatus = response.headers.get("X-Audio-Cache")?.toUpperCase();
  const resultSource: "asset-cache" | "realtime-tts" = source === "asset-cache" || cacheStatus === "HIT"
    ? "asset-cache"
    : "realtime-tts";
  return {
    blob: await response.blob(),
    ttfbMs,
    source: resultSource,
  };
}

async function synthesize(request: AudioRequest, signal: AbortSignal) {
  return fetch("/api/tts/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      locale: localeMap[request.locale],
      style: request.category,
      contentVersion: "v1",
    }),
    signal,
  });
}

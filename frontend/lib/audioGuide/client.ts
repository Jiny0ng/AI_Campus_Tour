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
  let response = request.source.kind === "asset"
    ? await fetch(`/api/tts/assets/${encodeURIComponent(request.source.assetId)}`, { signal })
    : await synthesize(request, signal);
  // A manifest can lag behind a content deployment. Preserve guidance by using
  // the same reviewed text through the shared synthesis endpoint.
  if (!response.ok && request.source.kind === "asset" && allowAssetSynthesisFallback) {
    response = await synthesize(request, signal);
  }
  const ttfbMs = performance.now() - startedAt;
  if (!response.ok) throw Object.assign(new Error("Audio request failed"), { ttfbMs });
  return { blob: await response.blob(), ttfbMs };
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

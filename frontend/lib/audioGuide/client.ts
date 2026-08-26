import type { AudioRequest } from "@/types/audioGuide";

const localeMap = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "cmn-CN",
} as const;

export function audioCacheKey(request: AudioRequest) {
  return [request.text, request.locale, request.category].join("|");
}

export async function fetchAudio(
  request: AudioRequest,
  signal: AbortSignal,
) {
  const startedAt = performance.now();
  const response = await synthesizeWithRetry(request, signal);
  const ttfbMs = performance.now() - startedAt;
  if (!response.ok) throw Object.assign(new Error("Audio request failed"), { ttfbMs });
  // A synth cache miss waits for model generation. That duration is not a
  // network-quality signal; a cache hit or static asset request is.
  const cacheStatus = response.headers.get("X-Audio-Cache")?.toUpperCase();
  const resultSource: "asset-cache" | "realtime-tts" = cacheStatus === "HIT"
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

async function synthesizeWithRetry(request: AudioRequest, signal: AbortSignal) {
  const retryDelays = [350, 900];
  let lastResponse: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await synthesize(request, signal);
      lastResponse = response;
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
    if (attempt === retryDelays.length) break;
    const delay = retryDelays[attempt];
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Audio request failed");
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { AudioBlobLru } from "@/lib/audioGuide/cache";
import { audioCacheKey, fetchAudio } from "@/lib/audioGuide/client";
import { nextNetworkQuality, type NetworkSample } from "@/lib/audioGuide/networkQuality";
import { canPreempt, enqueueByPriority, isExpired, type QueuedAudio } from "@/lib/audioGuide/queue";
import { recordNarrationEvent } from "@/lib/audioGuide/sessionReport";
import { NETWORK_SAMPLE_EVENT } from "@/lib/networkFetch";
import type {
  AudioCategory,
  AudioGuideApi,
  AudioGuideStatus,
  AudioRequest,
  NetworkQuality,
  PlaybackOutcome,
} from "@/types/audioGuide";

const AudioGuideContext = createContext<AudioGuideApi | null>(null);

type ActiveAudio = QueuedAudio & { token: number; sourceUrl?: string };
type SuspendedAudio = ActiveAudio & { sourceUrl: string; positionSeconds: number };

function silentWavUrl() {
  const sampleCount = 2_205;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44_100, true);
  view.setUint32(28, 88_200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function AudioGuideProvider({ children }: { children: ReactNode }) {
  const { locale, volume, isMuted } = useAppSettings();
  const [status, setStatus] = useState<AudioGuideStatus>({
    request: null,
    playback: "idle",
    network: "online",
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<AudioBlobLru | null>(null);
  const queueRef = useRef<QueuedAudio[]>([]);
  const activeRef = useRef<ActiveAudio | null>(null);
  const suspendedRef = useRef<SuspendedAudio | null>(null);
  const orderRef = useRef(0);
  const tokenRef = useRef(0);
  const seenIdsRef = useRef(new Set<string>());
  const pendingFetchesRef = useRef(new Map<string, Promise<string>>());
  const controllersRef = useRef(new Set<AbortController>());
  const networkRef = useRef<NetworkQuality>("online");
  const samplesRef = useRef<NetworkSample[]>([]);
  const unlockedRef = useRef(false);
  const networkMessagePlayedRef = useRef(false);
  const networkGraceUntilRef = useRef(0);
  const localSystemFilesRef = useRef(new Set<string>());
  const drainRef = useRef<() => void>(() => undefined);
  const resumeSuspendedRef = useRef<() => void>(() => undefined);

  const updateNetwork = useCallback((sample: NetworkSample, browserOnline = navigator.onLine) => {
    samplesRef.current = [...samplesRef.current.slice(-4), sample];
    // Browser offline is definitive. Otherwise, allow initial route, GPS and
    // audio requests to settle before surfacing a non-blocking warning.
    if (browserOnline && Date.now() < networkGraceUntilRef.current) return;
    const next = nextNetworkQuality(networkRef.current, samplesRef.current, browserOnline);
    networkRef.current = next;
    setStatus((current) => ({ ...current, network: next }));
  }, []);

  const finishActive = useCallback((outcome: PlaybackOutcome) => {
    const active = activeRef.current;
    if (!active) return;
    if (active.request.report?.include) {
      recordNarrationEvent(
        active.request,
        outcome === "skipped" ? "text-only" : outcome,
      );
    }
    active.resolve(outcome);
    activeRef.current = null;
    setStatus((current) => ({ ...current, request: null, playback: "idle" }));
  }, []);

  const finishSuspended = useCallback((outcome: PlaybackOutcome) => {
    const suspended = suspendedRef.current;
    if (!suspended) return;
    if (suspended.request.report?.include) {
      recordNarrationEvent(
        suspended.request,
        outcome === "skipped" ? "text-only" : outcome,
      );
    }
    suspended.resolve(outcome);
    suspendedRef.current = null;
  }, []);

  const loadUrl = useCallback(async (request: AudioRequest) => {
    const key = audioCacheKey(request);
    const cache = cacheRef.current;
    const cached = cache?.get(key);
    if (cached) return cached;
    const pending = pendingFetchesRef.current.get(key);
    if (pending) return pending;
    const controller = new AbortController();
    controllersRef.current.add(controller);
    const operation = fetchAudio(request, controller.signal, networkRef.current === "online")
      .then(({ blob, ttfbMs, source }) => {
        updateNetwork({
          ttfbMs,
          ok: true,
          at: Date.now(),
          source,
          affectsQuality: source !== "realtime-tts",
        });
        return cache?.put(key, blob) ?? URL.createObjectURL(blob);
      })
      .catch((error: unknown) => {
        const ttfbMs = typeof error === "object" && error !== null && "ttfbMs" in error
          ? Number(error.ttfbMs)
          : 12_000;
        updateNetwork({
          ttfbMs,
          ok: false,
          at: Date.now(),
          source: request.source.kind === "asset" ? "asset-cache" : "realtime-tts",
          affectsQuality: request.source.kind === "asset",
        });
        throw error;
      })
      .finally(() => {
        pendingFetchesRef.current.delete(key);
        controllersRef.current.delete(controller);
      });
    pendingFetchesRef.current.set(key, operation);
    return operation;
  }, [updateNetwork]);

  const startItem = useCallback(async (item: QueuedAudio) => {
    if (isExpired(item.request)) {
      if (item.request.report?.include) recordNarrationEvent(item.request, "text-only");
      item.resolve("skipped");
      drainRef.current();
      return;
    }
    const cached = cacheRef.current?.get(audioCacheKey(item.request));
    if (networkRef.current === "text-only" && !cached) {
      if (item.request.report?.include) recordNarrationEvent(item.request, "text-only");
      item.resolve("skipped");
      drainRef.current();
      return;
    }

    const token = ++tokenRef.current;
    activeRef.current = { ...item, token };
    setStatus((current) => ({ ...current, request: item.request, playback: "loading" }));
    try {
      const url = cached ?? await loadUrl(item.request);
      if (activeRef.current?.token !== token || tokenRef.current !== token || isExpired(item.request)) {
        if (activeRef.current?.token === token) finishActive("skipped");
        drainRef.current();
        return;
      }
      const audio = audioRef.current;
      if (!audio) throw new Error("audio element is unavailable");
      if (activeRef.current?.token === token) activeRef.current.sourceUrl = url;
      audio.src = url;
      audio.volume = volume;
      audio.muted = isMuted;
      await audio.play();
      unlockedRef.current = true;
      setStatus((current) => ({ ...current, playback: "playing" }));
    } catch (error) {
      if (activeRef.current?.token !== token || tokenRef.current !== token) return;
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      if (blocked) {
        setStatus((current) => ({ ...current, playback: "blocked" }));
        return;
      }
      finishActive("skipped");
      drainRef.current();
    }
  }, [finishActive, isMuted, loadUrl, volume]);

  const resumeSuspended = useCallback(async () => {
    const suspended = suspendedRef.current;
    const audio = audioRef.current;
    if (!suspended || !audio) return;
    if (isExpired(suspended.request)) {
      finishSuspended("skipped");
      drainRef.current();
      return;
    }

    const token = ++tokenRef.current;
    activeRef.current = { ...suspended, token, sourceUrl: suspended.sourceUrl };
    suspendedRef.current = null;
    setStatus((current) => ({ ...current, request: suspended.request, playback: "loading" }));
    try {
      audio.src = suspended.sourceUrl;
      audio.currentTime = suspended.positionSeconds;
      audio.volume = volume;
      audio.muted = isMuted;
      await audio.play();
      unlockedRef.current = true;
      setStatus((current) => ({ ...current, playback: "playing" }));
    } catch (error) {
      if (activeRef.current?.token !== token || tokenRef.current !== token) return;
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      if (blocked) {
        setStatus((current) => ({ ...current, playback: "blocked" }));
        return;
      }
      finishActive("skipped");
      drainRef.current();
    }
  }, [finishActive, finishSuspended, isMuted, volume]);
  resumeSuspendedRef.current = () => { void resumeSuspended(); };

  const drain = useCallback(() => {
    if (activeRef.current) return;
    let next = queueRef.current[0];
    while (next && isExpired(next.request)) {
      queueRef.current.shift();
      next.resolve("skipped");
      next = queueRef.current[0];
    }
    // A suspended docent keeps its place ahead of ordinary queued audio. Only
    // another urgent route instruction may run before it resumes.
    if (suspendedRef.current && (!next || next.request.priority < 90)) {
      resumeSuspendedRef.current();
      return;
    }
    if (next) {
      queueRef.current.shift();
      void startItem(next);
    }
  }, [startItem]);
  drainRef.current = drain;

  const interruptAndStart = useCallback(async (item: QueuedAudio) => {
    const audio = audioRef.current;
    const active = activeRef.current;
    if (!audio || !active) {
      queueRef.current = enqueueByPriority(queueRef.current, item);
      drainRef.current();
      return;
    }
    const token = ++tokenRef.current;
    const startVolume = audio.volume;
    for (let step = 4; step >= 0; step -= 1) {
      if (tokenRef.current !== token) return;
      audio.volume = startVolume * step / 5;
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    }
    audio.pause();
    const sourceUrl = active.sourceUrl;
    const canResume = ["navigation", "arrival"].includes(item.request.category)
      && active.request.resumePolicy === "resume"
      && typeof sourceUrl === "string";
    if (canResume && sourceUrl) {
      suspendedRef.current = {
        ...active,
        sourceUrl,
        positionSeconds: audio.currentTime,
      };
      activeRef.current = null;
      setStatus((current) => ({ ...current, request: null, playback: "idle" }));
    } else if (!sourceUrl) {
      // The previous item was still loading. Retry it after the urgent
      // instruction instead of resolving its promise as if it had completed.
      activeRef.current = null;
      queueRef.current = enqueueByPriority(queueRef.current, active);
      setStatus((current) => ({ ...current, request: null, playback: "idle" }));
    } else {
      finishActive("interrupted");
    }
    audio.volume = volume;
    audio.muted = isMuted;
    await startItem(item);
  }, [finishActive, isMuted, startItem, volume]);

  const speak = useCallback((request: AudioRequest) => new Promise<PlaybackOutcome>((resolve) => {
    const dynamicBlocked = networkRef.current !== "online"
      && ["location-docent", "filler", "user-answer"].includes(request.category);
    if (!request.text.trim() || dynamicBlocked || isExpired(request) || seenIdsRef.current.has(request.id)) {
      if (request.report?.include) recordNarrationEvent(request, "text-only");
      resolve("skipped");
      return;
    }
    seenIdsRef.current.add(request.id);
    const item = { request, order: orderRef.current++, resolve };
    const active = activeRef.current;
    if (active && canPreempt(active.request, request)) {
      void interruptAndStart(item);
      return;
    }
    queueRef.current = enqueueByPriority(queueRef.current, item);
    drainRef.current();
  }), [interruptAndStart]);

  const prefetch = useCallback(async (request: AudioRequest) => {
    const dynamicBlocked = networkRef.current !== "online"
      && ["location-docent", "filler", "user-answer"].includes(request.category);
    if (dynamicBlocked || isExpired(request) || networkRef.current === "text-only") return;
    try {
      await loadUrl(request);
    } catch {
      // Prefetch is opportunistic and must not affect screen behavior.
    }
  }, [loadUrl]);

  const stop = useCallback((_reason?: string) => {
    tokenRef.current += 1;
    const audio = audioRef.current;
    audio?.pause();
    if (activeRef.current) finishActive("interrupted");
    finishSuspended("interrupted");
    queueRef.current.forEach((item) => item.resolve("skipped"));
    queueRef.current = [];
  }, [finishActive, finishSuspended]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    if (activeRef.current) setStatus((current) => ({ ...current, playback: "paused" }));
  }, []);

  const resume = useCallback(() => {
    if (!activeRef.current || !audioRef.current) return;
    void audioRef.current.play()
      .then(() => setStatus((current) => ({ ...current, playback: "playing" })))
      .catch(() => setStatus((current) => ({ ...current, playback: "blocked" })));
  }, []);

  const unlock = useCallback(async () => {
    if (unlockedRef.current) return true;
    const audio = audioRef.current;
    if (!audio || activeRef.current) return false;
    const url = silentWavUrl();
    try {
      audio.src = url;
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.muted = isMuted;
      unlockedRef.current = true;
      return true;
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [isMuted]);

  const beginNetworkGrace = useCallback((durationMs = 10_000) => {
    networkGraceUntilRef.current = Math.max(
      networkGraceUntilRef.current,
      Date.now() + Math.max(0, durationMs),
    );
  }, []);

  const clearCategory = useCallback((category: AudioCategory) => {
    queueRef.current = queueRef.current.filter((item) => {
      if (item.request.category !== category) return true;
      item.resolve("skipped");
      return false;
    });
    if (activeRef.current?.request.category === category) {
      const audio = audioRef.current;
      audio?.pause();
      finishActive("interrupted");
      drainRef.current();
    }
    if (suspendedRef.current?.request.category === category) finishSuspended("interrupted");
  }, [finishActive, finishSuspended]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    cacheRef.current = new AudioBlobLru();
    void fetch("/audio/system/manifest.json", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : { available: [] })
      .then((payload: { available?: string[] }) => {
        localSystemFilesRef.current = new Set(payload.available ?? []);
      })
      .catch(() => undefined);
    const ended = () => {
      finishActive("completed");
      drainRef.current();
    };
    const failed = () => {
      finishActive("skipped");
      drainRef.current();
    };
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", failed);
    const unlockOnGesture = () => { void unlock(); };
    window.addEventListener("pointerdown", unlockOnGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnGesture, { capture: true });
      audio.removeEventListener("ended", ended);
      audio.removeEventListener("error", failed);
      audio.pause();
      controllersRef.current.forEach((controller) => controller.abort());
      finishSuspended("interrupted");
      cacheRef.current?.clear();
      audioRef.current = null;
    };
  }, [finishActive, finishSuspended, unlock]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.muted = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    const receiveSample = (event: Event) => {
      const detail = (event as CustomEvent<NetworkSample>).detail;
      if (detail && typeof detail.ttfbMs === "number") updateNetwork(detail);
    };
    window.addEventListener(NETWORK_SAMPLE_EVENT, receiveSample);
    return () => window.removeEventListener(NETWORK_SAMPLE_EVENT, receiveSample);
  }, [updateNetwork]);

  useEffect(() => {
    const offline = () => {
      networkRef.current = "text-only";
      setStatus((current) => ({ ...current, network: "text-only" }));
    };
    const online = () => {
      networkRef.current = "recovering";
      setStatus((current) => ({ ...current, network: "recovering" }));
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if (status.network === "online") return;
    let checks = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || checks >= 20) return;
      checks += 1;
      const started = performance.now();
      try {
        const response = await fetch("/api/health/network", { cache: "no-store" });
        updateNetwork({ ttfbMs: performance.now() - started, ok: response.ok, at: Date.now(), source: "health" });
      } catch {
        updateNetwork({ ttfbMs: performance.now() - started, ok: false, at: Date.now(), source: "health" });
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => window.clearInterval(timer);
  }, [status.network, updateNetwork]);

  useEffect(() => {
    if (
      status.network !== "text-only"
      || activeRef.current
      || networkMessagePlayedRef.current
      || !audioRef.current
    ) return;
    const filename = `network-unavailable-${locale}.mp3`;
    if (!localSystemFilesRef.current.has(filename)) return;
    networkMessagePlayedRef.current = true;
    const audio = audioRef.current;
    audio.src = `/audio/system/${filename}`;
    audio.volume = volume;
    audio.muted = isMuted;
    void audio.play().catch(() => undefined);
  }, [isMuted, locale, status.network, volume]);

  const value = useMemo<AudioGuideApi>(() => ({
    status,
    speak,
    prefetch,
    stop,
    pause,
    resume,
    unlock,
    beginNetworkGrace,
    clearCategory,
  }), [beginNetworkGrace, clearCategory, pause, prefetch, resume, speak, status, stop, unlock]);

  return (
    <AudioGuideContext.Provider value={value}>
      {children}
    </AudioGuideContext.Provider>
  );
}

export function useAudioGuide() {
  const context = useContext(AudioGuideContext);
  if (!context) throw new Error("useAudioGuide must be used inside AudioGuideProvider");
  return context;
}

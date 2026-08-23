import type { AppLocale } from "@/contexts/AppSettingsContext";

export type AudioCategory =
  | "navigation"
  | "arrival"
  | "core-docent"
  | "location-docent"
  | "filler"
  | "system"
  | "user-answer";

export type AudioRequest = {
  id: string;
  text: string;
  locale: AppLocale;
  category: AudioCategory;
  priority: number;
  source: { kind: "asset"; assetId: string } | { kind: "tts" };
  interruptible: boolean;
  expiresAt?: number;
  report?: { placeId?: string; placeName?: string; include: boolean };
};

export type PlaybackOutcome = "completed" | "interrupted" | "skipped";
export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "blocked";
export type NetworkQuality = "online" | "degraded" | "text-only" | "recovering";

export type AudioGuideStatus = {
  request: AudioRequest | null;
  playback: PlaybackState;
  network: NetworkQuality;
  message?: string;
};

export type AudioGuideApi = {
  status: AudioGuideStatus;
  speak(request: AudioRequest): Promise<PlaybackOutcome>;
  prefetch(request: AudioRequest): Promise<void>;
  stop(reason?: string): void;
  pause(): void;
  resume(): void;
  unlock(): Promise<boolean>;
  clearCategory(category: AudioCategory): void;
};

export type TourNarrationEvent = {
  id: string;
  category: "core-docent" | "location-docent" | "tip" | "question-answer";
  text: string;
  placeId?: string;
  placeName?: string;
  occurredAt: string;
  playback: "completed" | "interrupted" | "text-only";
  includeInReport: boolean;
};


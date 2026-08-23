import type { AudioRequest, TourNarrationEvent } from "@/types/audioGuide";

const STORAGE_KEY = "campus-tour-narration-events";
const VISITED_KEY = "campus-tour-visited-places";

function storeEvent(event: TourNarrationEvent) {
  try {
    const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as TourNarrationEvent[];
    const withoutDuplicate = existing.filter((item) => item.id !== event.id);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...withoutDuplicate, event]));
  } catch {
    // A report is optional; storage failures must never interrupt navigation.
  }
}

export function recordNarrationEvent(
  request: AudioRequest,
  playback: "completed" | "interrupted" | "text-only",
) {
  if (!request.report?.include || typeof window === "undefined") return;
  const category = request.id.startsWith("tour-tip:")
    ? "tip"
    : request.category === "user-answer"
      ? "question-answer"
      : request.category;
  if (!(["core-docent", "location-docent", "tip", "question-answer"] as string[]).includes(category)) return;
  const event: TourNarrationEvent = {
    id: request.id,
    category: category as TourNarrationEvent["category"],
    text: request.text,
    placeId: request.report.placeId,
    placeName: request.report.placeName,
    occurredAt: new Date().toISOString(),
    playback,
    includeInReport: true,
  };
  storeEvent(event);
}

export function recordTipViewed(
  id: string,
  text: string,
  placeId?: string,
  placeName?: string,
) {
  if (typeof window === "undefined") return;
  storeEvent({
    id: `tip-view:${id}`,
    category: "tip",
    text,
    placeId,
    placeName,
    occurredAt: new Date().toISOString(),
    playback: "text-only",
    includeInReport: true,
  });
}

export function readNarrationEvents(): TourNarrationEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as TourNarrationEvent[];
  } catch {
    return [];
  }
}

export function recordVisitedPlace(id: string, name: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? "[]") as Array<{ id: string; name: string }>;
    sessionStorage.setItem(
      VISITED_KEY,
      JSON.stringify([...existing.filter((place) => place.id !== id), { id, name }]),
    );
  } catch {
    // Arrival reporting is optional and must not affect the tour state.
  }
}

export function readVisitedPlaces() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? "[]") as Array<{ id: string; name: string }>;
  } catch {
    return [];
  }
}

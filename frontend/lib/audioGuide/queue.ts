import type { AudioRequest } from "@/types/audioGuide";

export type QueuedAudio = {
  request: AudioRequest;
  order: number;
  resolve: (outcome: "completed" | "interrupted" | "skipped") => void;
};

export function enqueueByPriority(queue: QueuedAudio[], item: QueuedAudio) {
  return [...queue, item].sort((first, second) => (
    second.request.priority - first.request.priority || first.order - second.order
  ));
}

export function isExpired(request: AudioRequest, now = Date.now()) {
  return typeof request.expiresAt === "number" && request.expiresAt <= now;
}

export function canPreempt(current: AudioRequest, incoming: AudioRequest) {
  if (incoming.category === "navigation") return current.category !== "navigation";
  return current.interruptible && incoming.priority > current.priority;
}


"use client";

import { Pause, Play, Volume2, X } from "lucide-react";
import { useAudioGuide } from "@/contexts/AudioGuideContext";

export function AudioStatusBar() {
  const { status, pause, resume, stop, unlock } = useAudioGuide();
  if (!status.request && status.network === "online") return null;

  const blocked = status.playback === "blocked";
  const paused = status.playback === "paused";
  return (
    <div className="pointer-events-auto fixed left-1/2 top-2 z-[90] flex h-11 w-[min(calc(100%-24px),406px)] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/95 px-3 shadow-floating backdrop-blur-md">
      <Volume2 size={17} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
        {blocked
          ? "음성 안내를 시작하려면 눌러 주세요"
          : status.request?.text ?? (status.network === "text-only" ? "텍스트 안내 모드" : "연결이 불안정합니다")}
      </span>
      {status.request ? (
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary"
          aria-label={blocked ? "음성 안내 시작" : paused ? "재생" : "일시정지"}
          onClick={() => {
            if (blocked) void unlock().then((ok) => { if (ok) resume(); });
            else if (paused) resume();
            else pause();
          }}
        >
          {paused || blocked ? <Play size={16} /> : <Pause size={16} />}
        </button>
      ) : null}
      {status.request ? (
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full text-muted"
          aria-label="현재 음성 닫기"
          onClick={() => stop("user")}
        >
          <X size={17} />
        </button>
      ) : null}
    </div>
  );
}


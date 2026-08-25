"use client";

import { usePathname } from "next/navigation";
import { Pause, Play, Volume2, X } from "lucide-react";
import { useAudioGuide } from "@/contexts/AudioGuideContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { cn } from "@/lib/cn";

export function AudioStatusBar() {
  const { status, pause, resume, stop } = useAudioGuide();
  const { t } = useAppSettings();
  const pathname = usePathname();
  if (!status.request && status.network === "online") return null;

  const blocked = status.playback === "blocked";
  const paused = status.playback === "paused";
  const isGuideScreen = pathname.startsWith("/guide");
  const label = blocked
    ? t("audio.start")
    : status.request?.text ?? (status.network === "text-only" ? t("audio.textMode") : t("audio.unstable"));

  return (
    <div
      className={cn(
        "pointer-events-auto fixed z-[90] flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 shadow-floating backdrop-blur-md",
        isGuideScreen
          ? "left-[max(62px,calc(50%_-_153px))] top-[72px] h-8 w-[min(220px,calc(100vw_-_154px))]"
          : "left-1/2 top-2 h-11 w-[min(calc(100%-24px),406px)] -translate-x-1/2",
      )}
    >
      <Volume2 size={17} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
        {label}
      </span>
      {status.request ? (
        <button
          type="button"
          className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary"
          aria-label={blocked ? t("audio.start") : paused ? t("audio.resume") : t("audio.pause")}
          onClick={() => {
            if (blocked) resume();
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
          aria-label={t("settings.close")}
          onClick={() => stop("user")}
        >
          <X size={17} />
        </button>
      ) : null}
    </div>
  );
}

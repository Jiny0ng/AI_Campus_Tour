"use client";

import { ArrowRight, Lightbulb, MessageCirclePlus } from "lucide-react";
import { Button, Chip } from "@/components/Common";
import type { CampusTourStop } from "@/types";

type AiTourSheetProps = {
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  onNext: () => void;
  isLastStop: boolean;
};

export function AiTourSheet({ currentStop, nextStop, onNext, isLastStop }: AiTourSheetProps) {
  if (!currentStop) {
    return (
      <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
        <div className="mx-auto mb-6 h-1 w-9 rounded-full bg-handle" />
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary animate-pulse" />
          <h1 className="h-6 w-3/4 rounded bg-line animate-pulse" />
        </div>
        <p className="mt-6 h-20 w-full rounded bg-line animate-pulse" />
        <div className="mt-5 flex gap-2">
          <div className="h-7 w-16 rounded-full bg-line animate-pulse" />
          <div className="h-7 w-20 rounded-full bg-line animate-pulse" />
        </div>
        <div className="mt-5 rounded-card border border-primary/20 bg-primary-soft p-4 h-24 animate-pulse" />
        <div className="mt-5 h-14 w-full rounded-button bg-line animate-pulse" />
      </section>
    );
  }

  return (
    <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
      <div className="mx-auto mb-6 h-1 w-9 rounded-full bg-handle" />

      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <MessageCirclePlus size={19} />
        </span>
        <h1 className="text-xl font-extrabold text-ink">{currentStop.name}</h1>
      </div>

      <p className="mt-6 text-[15px] font-medium leading-[25px] text-ink">{currentStop.description}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {currentStop.tags.map((tag) => (
          <Chip key={`${tag.label}-${tag.value}`} size="sm" variant="default" className="h-7 bg-page text-[11px]">
            {tag.label}: {tag.value}
          </Chip>
        ))}
      </div>

      <div className="mt-5 rounded-card border border-primary/20 bg-primary-soft p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
          <Lightbulb size={18} />
          <span>학생 꿀팁</span>
        </div>
        <ul className="mt-2 space-y-1 text-[13px] font-medium leading-5 text-ink">
          {currentStop.studentTip.map((tip) => (
            <li key={tip}>· {tip}</li>
          ))}
        </ul>
      </div>

      <Button
        type="button"
        variant={isLastStop ? "primary" : "ghost"}
        size="lg"
        fullWidth
        rightIcon={!isLastStop ? <ArrowRight size={20} /> : undefined}
        className={
          isLastStop
            ? "mt-5 px-4"
            : "mt-5 justify-between border border-line bg-page px-4 text-ink shadow-card hover:bg-page"
        }
        onClick={onNext}
      >
        <span className="text-left text-sm">
          {isLastStop ? (
            "투어 완료"
          ) : (
            <>
              <span className="text-muted">다음 목적지</span>{" "}
              <strong className="text-ink">
                {nextStop?.name} ({currentStop.walkingMinutesToNext}분 도보)
              </strong>
            </>
          )}
        </span>
      </Button>
    </section>
  );
}

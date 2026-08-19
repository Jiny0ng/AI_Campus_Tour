"use client";

import { useState, useEffect } from "react";
import { ArrowRight, ChevronLeft, Lightbulb, MapPin, MessageCirclePlus, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Common";
import type { CampusTourNearbySpot, CampusTourStop } from "@/types";

type AiTourSheetProps = {
  currentStop?: CampusTourStop;
  nextStop?: CampusTourStop;
  onNext: () => void;
  onPrev?: () => void;
  hasPrev?: boolean;
  isLastStop: boolean;
  onAddWaypoint?: (spot: CampusTourNearbySpot) => void;
  nearbySpots?: CampusTourNearbySpot[];
  isNearbyLoading?: boolean;
  addingSpotId?: string | null;
  segmentInfo?: { pois: any[]; tips: any[] } | null;
  isSegmentLoading?: boolean;
};

export function AiTourSheet({ currentStop, nextStop, onNext, onPrev, hasPrev, isLastStop, onAddWaypoint, nearbySpots = [], isNearbyLoading = false, addingSpotId, segmentInfo, isSegmentLoading }: AiTourSheetProps) {
  const [isExpanded, setIsExpanded] = useState(!isSegmentLoading);

  useEffect(() => {
    if (isSegmentLoading) {
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  }, [isSegmentLoading]);

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

  const displayStop = nextStop || currentStop;

  return (
    <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
      <div
        className="mx-auto mb-2 flex h-8 w-full cursor-pointer items-center justify-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="h-1.5 w-10 rounded-full bg-handle" />
      </div>

      <div
        onClick={() => !isExpanded && setIsExpanded(true)}
        className={!isExpanded ? "cursor-pointer" : ""}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <MessageCirclePlus size={19} />
          </span>
          <h1 className="text-xl font-extrabold text-ink">{displayStop.name}</h1>
          <button
            type="button"
            className="ml-auto text-muted hover:text-ink transition-colors"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          >
            {isExpanded ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
          </button>
        </div>

        {!isExpanded && (
          <div className="mt-3 text-sm text-muted line-clamp-1 pl-12">
            {isSegmentLoading ? "AI 도슨트가 주변 정보와 꿀팁을 탐색 중입니다..." : "눌러서 주변 정보 및 꿀팁 보기"}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-5 rounded-card border border-primary/20 bg-primary-soft p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-primary mb-3">
                <Lightbulb size={18} />
                <span>경로 꿀팁 & 주변 정보</span>
              </div>

              {isSegmentLoading ? (
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                </div>
              ) : segmentInfo && segmentInfo.tips.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  {segmentInfo.tips.map((tipInfo: any, idx: number) => (
                    <div key={idx} className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 snap-center flex flex-col shadow-sm bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{tipInfo.icon}</span>
                        <span className="font-bold text-ink text-sm truncate">{tipInfo.name}</span>
                      </div>
                      <p className="text-xs text-muted font-medium mb-1">{tipInfo.category}</p>
                      <p className="text-sm text-ink line-clamp-3">{tipInfo.tip}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">
                  이 구간의 특별한 꿀팁이 없습니다.
                </div>
              )}

              <div className="mb-3 mt-4 flex items-center gap-2 border-t border-primary/15 pt-4">
                <MapPin size={18} className="text-primary" />
                <h2 className="text-sm font-extrabold text-ink">주변 가볼만한 곳</h2>
              </div>

              {isNearbyLoading ? (
                <div className="h-[104px] animate-pulse rounded-card bg-line/70" />
              ) : nearbySpots.length > 0 ? (
                <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 no-scrollbar">
                  {nearbySpots.map((spot) => (
                    <article
                      key={spot.id}
                      className="flex w-[270px] shrink-0 snap-center items-center gap-3 rounded-card border border-primary/15 bg-surface p-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-extrabold text-ink">{spot.name}</span>
                          <span className="shrink-0 text-[10px] font-bold text-primary">
                            {spot.distanceMeters}m
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-muted">{spot.category}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-4 text-ink/80">
                          {spot.description}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="h-9 shrink-0 rounded-full px-3 text-xs"
                        disabled={Boolean(addingSpotId)}
                        onClick={() => onAddWaypoint?.(spot)}
                      >
                        {addingSpotId === spot.id ? "추가 중" : "경유하기"}
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-center text-xs font-medium text-muted">
                  현재 위치 100m 이내에 추천 스팟이 없습니다.
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              {hasPrev && onPrev && (
                <Button variant="secondary" onClick={onPrev} className="h-14 w-14 shrink-0 px-0">
                  <ChevronLeft size={24} className="text-ink" />
                </Button>
              )}
              <Button
                variant={isLastStop ? "secondary" : "primary"}
                className="h-14 flex-1 text-lg font-bold"
                onClick={onNext}
              >
                {isLastStop ? "투어 종료" : "다음 목적지"}
                {!isLastStop && <ArrowRight size={20} className="ml-2" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

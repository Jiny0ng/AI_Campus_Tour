"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ArrowRight, ChevronLeft, MapPin, MessageCirclePlus, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence, animate as animateValue, useDragControls, useMotionValue } from "framer-motion";
import { Button } from "@/components/Common";
import { useAppSettings } from "@/contexts/AppSettingsContext";
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
  isSegmentLoading?: boolean;
  hasArrived?: boolean;
  needsArrivalConfirmation?: boolean;
  remainingDistanceMeters?: number | null;
  onRecenterMap?: () => void;
  canRecenter?: boolean;
};

const insightIcons: Record<string, string> = {
  history: "🏛️",
  recommendation: "💡",
  facility: "🏢",
  experience: "✨",
  usage: "🧭",
  symbolism: "🎓",
  story: "📖",
  event: "🎪",
  seasonal: "🌸",
  hidden_place: "🔎",
  "hidden-place": "🔎",
};

export function AiTourSheet({ currentStop, nextStop, onNext, onPrev, hasPrev, isLastStop, onAddWaypoint, nearbySpots = [], isNearbyLoading = false, addingSpotId, isSegmentLoading, hasArrived = false, needsArrivalConfirmation = false, remainingDistanceMeters, onRecenterMap, canRecenter = false }: AiTourSheetProps) {
  const { t, pn } = useAppSettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const sheetRef = useRef<HTMLElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const sheetY = useMotionValue(0);
  const dragControls = useDragControls();
  const [maxDragY, setMaxDragY] = useState(0);
  const initializedDragRef = useRef(false);

  useLayoutEffect(() => {
    const updateConstraints = () => {
      const maximumHeight = window.innerHeight * 0.62;
      const minimumVisibleHeight = 145;
      const nextMaxDragY = Math.max(0, maximumHeight - minimumVisibleHeight);
      setMaxDragY(nextMaxDragY);
      if (!initializedDragRef.current) {
        sheetY.set(nextMaxDragY);
        initializedDragRef.current = true;
      } else if (sheetY.get() > nextMaxDragY) {
        sheetY.set(nextMaxDragY);
      }
    };
    updateConstraints();
    window.addEventListener("resize", updateConstraints);
    return () => window.removeEventListener("resize", updateConstraints);
  }, [sheetY]);

  const toggleSheet = () => {
    const nextExpanded = sheetY.get() > maxDragY / 2;
    setIsExpanded(nextExpanded);
    animateValue(sheetY, nextExpanded ? 0 : maxDragY, { type: "spring", bounce: 0, duration: 0.35 });
  };

  if (!currentStop) {
    return (
      <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
        <div className="mx-auto -mt-1 mb-6 h-1 w-9 rounded-full bg-handle" />
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
  const destinationDescription = displayStop.overview || displayStop.description;
  const destinationInsights = displayStop.insights || [];
  const formattedDistance = typeof remainingDistanceMeters === "number"
    ? remainingDistanceMeters >= 1000
      ? `${(remainingDistanceMeters / 1000).toFixed(1)}km`
      : `${remainingDistanceMeters}m`
    : null;
  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
    contentScrollRef.current?.querySelectorAll<HTMLElement>("[data-tour-slider]")
      .forEach((slider) => slider.scrollTo({ left: 0 }));
  }, [displayStop.id]);
  return (
    <>
    <motion.section
      ref={sheetRef}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: maxDragY }}
      dragElastic={0}
      dragMomentum={false}
      style={{ y: sheetY, height: "62dvh" }}
      onDragEnd={() => setIsExpanded(sheetY.get() < maxDragY / 2)}
      className="absolute inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[430px] flex-col rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet"
    >
      <div
        className="mx-auto -mt-2 mb-2 flex h-8 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <div className="h-1.5 w-10 rounded-full bg-handle" />
      </div>

      <div
        onClick={() => !isExpanded && toggleSheet()}
        className="shrink-0 cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            {isExpanded ? <MessageCirclePlus size={19} /> : <MapPin size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            {!isExpanded && (
              <p className="text-[11px] font-extrabold text-primary">
                {needsArrivalConfirmation
                  ? t("tour.confirmArrival")
                  : isLastStop ? t("tour.finish") : t("tour.next")}
              </p>
            )}
            <h1 className="truncate text-xl font-extrabold text-ink">{pn(displayStop.name)}</h1>
          </div>
          <button
            type="button"
            aria-label={isExpanded ? t("settings.close") : t("sheet.placeTips")}
            className="text-muted hover:text-ink transition-colors"
            onClick={(e) => { e.stopPropagation(); toggleSheet(); }}
          >
            {isExpanded ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
          </button>
        </div>

        {!isExpanded && (
          <p className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-ink/80">
            {destinationDescription || (isSegmentLoading ? t("sheet.loading") : t("sheet.noTips"))}
          </p>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            ref={contentScrollRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <p className="mt-4 text-sm font-medium leading-5 text-ink/80">
              {destinationDescription || (isSegmentLoading ? t("sheet.loading") : t("sheet.noTips"))}
            </p>
            <div className="mt-5 rounded-card border border-primary/20 bg-primary-soft p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageCirclePlus size={18} className="text-primary" />
                <h2 className="text-sm font-extrabold text-ink">{t("sheet.placeTips")}</h2>
              </div>

              {isSegmentLoading && destinationInsights.length === 0 ? (
                <div data-tour-slider className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                </div>
              ) : destinationInsights.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  {destinationInsights.map((insight, idx) => (
                    <article
                      key={`${insight.factId}-${idx}`}
                      className="flex min-h-[112px] w-[240px] shrink-0 snap-center items-start gap-3 rounded-card border border-primary/20 bg-white p-4 text-left shadow-sm"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-lg" aria-hidden="true">
                        {insightIcons[insight.category] || "💡"}
                      </span>
                      <p className="pt-1 text-sm leading-6 text-ink">{insight.content}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted">
                  {t("sheet.noTips")}
                </div>
              )}

              <div className="mb-3 mt-4 flex items-center gap-2 border-t border-primary/15 pt-4">
                <MapPin size={18} className="text-primary" />
                <h2 className="text-sm font-extrabold text-ink">{t("sheet.nearby")}</h2>
              </div>

              {isNearbyLoading ? (
                <div className="h-[104px] animate-pulse rounded-card bg-line/70" />
              ) : nearbySpots.length > 0 ? (
                <div data-tour-slider className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 no-scrollbar">
                  {nearbySpots.map((spot) => (
                    <article
                      key={spot.id}
                      className="flex w-[300px] shrink-0 snap-center flex-col rounded-card border border-primary/15 bg-surface p-3 shadow-sm"
                    >
                      <div className="w-full min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 text-sm font-extrabold leading-5 text-ink">{pn(spot.name)}</span>
                          <span className="shrink-0 text-[10px] font-bold text-primary">
                            {spot.distanceMeters}m
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-muted">{spot.category}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-4 text-ink/80">
                          {spot.description}
                        </p>
                      </div>
                      <div className="mt-3 flex w-full items-center gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="h-9 w-full rounded-full px-3 text-xs"
                          disabled={Boolean(addingSpotId)}
                          onClick={() => onAddWaypoint?.(spot)}
                        >
                          {addingSpotId === spot.id ? t("sheet.adding") : t("sheet.detour")}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-center text-xs font-medium text-muted">
                  {t("sheet.noNearby")}
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              {hasPrev && onPrev && (
                <Button
                  variant="secondary"
                  onClick={onPrev}
                  aria-label={t("tour.previous")}
                  className="relative h-14 min-w-0 flex-1 basis-0 px-3 text-[15px] font-extrabold"
                >
                  <ChevronLeft size={20} className="absolute left-3 shrink-0" />
                  <span className="absolute left-1/2 max-w-[calc(100%-48px)] -translate-x-1/2 truncate">
                    {t("tour.previous")}
                  </span>
                </Button>
              )}
              <Button
                variant={isLastStop || !hasArrived ? "secondary" : "primary"}
                className={`relative h-14 min-w-0 flex-1 basis-0 px-3 text-[15px] font-extrabold ${hasArrived ? "arrival-ready" : ""}`}
                onClick={onNext}
              >
                <span className="absolute left-1/2 max-w-[calc(100%-48px)] -translate-x-1/2 truncate">
                  {isLastStop ? t("tour.finish") : t("tour.next")}
                </span>
                {!isLastStop && <ArrowRight size={20} className="absolute right-3 shrink-0" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
    </>
  );
}

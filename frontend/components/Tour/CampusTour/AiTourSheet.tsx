"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, Lightbulb, LocateFixed, MapPin, MessageCirclePlus, ChevronDown, ChevronUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Common";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import type { CampusTourNearbySpot, CampusTourSegmentInfo, CampusTourStop } from "@/types";

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
  segmentInfo?: CampusTourSegmentInfo | null;
  isSegmentLoading?: boolean;
  hasArrived?: boolean;
  remainingDistanceMeters?: number | null;
  onRecenterMap?: () => void;
  canRecenter?: boolean;
};

type TourTip = CampusTourSegmentInfo["tips"][number];

export function AiTourSheet({ currentStop, nextStop, onNext, onPrev, hasPrev, isLastStop, onAddWaypoint, nearbySpots = [], isNearbyLoading = false, addingSpotId, segmentInfo, isSegmentLoading, hasArrived = false, remainingDistanceMeters, onRecenterMap, canRecenter = false }: AiTourSheetProps) {
  const { t } = useAppSettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTip, setSelectedTip] = useState<TourTip | null>(null);

  useEffect(() => {
    setIsExpanded(false);
    setSelectedTip(null);
  }, [currentStop?.id]);

  useEffect(() => {
    if (!selectedTip) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTip(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedTip]);

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
  const destinationTip = segmentInfo?.tips.find(
    (tipInfo) =>
      tipInfo.name.includes(displayStop.name)
      || displayStop.name.includes(tipInfo.name),
  )?.tip;
  const destinationDescription = destinationTip || displayStop.description;
  const formattedDistance = typeof remainingDistanceMeters === "number"
    ? remainingDistanceMeters >= 1000
      ? `${(remainingDistanceMeters / 1000).toFixed(1)}km`
      : `${remainingDistanceMeters}m`
    : null;

  return (
    <>
    <section className="absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] rounded-t-[22px] bg-surface px-8 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-sheet">
      {onRecenterMap && (
        <button
          type="button"
          aria-label={t("map.recenter")}
          title={t("map.recenter")}
          disabled={!canRecenter}
          onClick={onRecenterMap}
          className="absolute -top-14 right-4 grid size-11 place-items-center rounded-full bg-surface/95 text-primary shadow-card backdrop-blur-sm transition active:scale-95 disabled:opacity-45"
        >
          <LocateFixed size={21} />
        </button>
      )}
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
            {isExpanded ? <MessageCirclePlus size={19} /> : <MapPin size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            {!isExpanded && (
              <p className="text-[11px] font-extrabold text-primary">
                {isLastStop ? t("tour.finish") : t("tour.next")}
              </p>
            )}
            <h1 className="truncate text-xl font-extrabold text-ink">{displayStop.name}</h1>
          </div>
          <button
            type="button"
            aria-label={isExpanded ? t("settings.close") : t("sheet.tips")}
            className="text-muted hover:text-ink transition-colors"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          >
            {isExpanded ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
          </button>
        </div>

        {!isExpanded && (
          <div className="mt-3 rounded-card border border-primary/15 bg-primary-soft/70 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="line-clamp-2 text-sm font-medium leading-5 text-ink/80">
                {destinationDescription || (isSegmentLoading ? t("sheet.loading") : t("sheet.noTips"))}
              </p>
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-extrabold text-primary shadow-sm">
                {hasArrived
                  ? t("tour.arrived")
                  : formattedDistance
                    ? `${t("tour.remaining")} ${formattedDistance}`
                    : t("tour.remaining")}
              </span>
            </div>
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
            className="max-h-[62dvh] overflow-y-auto overscroll-contain"
          >
            <div className="mt-5 rounded-card border border-primary/20 bg-primary-soft p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-primary mb-3">
                <Lightbulb size={18} />
                <span>{t("sheet.tips")}</span>
              </div>

              {isSegmentLoading ? (
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                  <div className="shrink-0 w-[240px] rounded-card border border-primary/20 bg-primary-soft p-4 h-[120px] snap-center animate-pulse" />
                </div>
              ) : segmentInfo && segmentInfo.tips.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
                  {segmentInfo.tips.map((tipInfo, idx) => (
                    <button
                      key={`${tipInfo.name}-${idx}`}
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => setSelectedTip(tipInfo)}
                      className="flex w-[240px] shrink-0 snap-center flex-col rounded-card border border-primary/20 bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{tipInfo.icon}</span>
                        <span className="font-bold text-ink text-sm truncate">{tipInfo.name}</span>
                      </div>
                      <p className="text-xs text-muted font-medium mb-1">{tipInfo.category}</p>
                      <p className="text-sm text-ink line-clamp-3">{tipInfo.tip}</p>
                      <span className="mt-3 text-xs font-bold text-primary">
                        {t("sheet.tipDetails")} →
                      </span>
                    </button>
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
                        {addingSpotId === spot.id ? t("sheet.adding") : t("sheet.detour")}
                      </Button>
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
                  className="h-14 shrink-0 px-3 text-sm"
                >
                  <ChevronLeft size={21} />
                  {t("tour.previous")}
                </Button>
              )}
              <Button
                variant={isLastStop || !hasArrived ? "secondary" : "primary"}
                className={`h-14 flex-1 text-lg font-bold ${hasArrived ? "arrival-ready" : ""}`}
                onClick={onNext}
              >
                {isLastStop ? t("tour.finish") : t("tour.next")}
                {!isLastStop && <ArrowRight size={20} className="ml-2" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
    {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {selectedTip && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-16 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTip(null)}
          >
            <motion.article
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-tip-dialog-title"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="max-h-[75dvh] w-full max-w-[390px] overflow-y-auto rounded-[24px] bg-surface p-5 shadow-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-2xl">
                  {selectedTip.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-primary">{t("sheet.tipDetails")}</p>
                  <h2 id="tour-tip-dialog-title" className="mt-1 text-xl font-extrabold leading-7 text-ink">
                    {selectedTip.name}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label={t("sheet.closeDetails")}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-line/70 text-ink"
                  onClick={() => setSelectedTip(null)}
                >
                  <X size={19} />
                </button>
              </div>
              <span className="mt-4 inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                {selectedTip.category}
              </span>
              <p className="mt-4 whitespace-pre-wrap text-[15px] font-medium leading-7 text-ink/85">
                {selectedTip.tip}
              </p>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )}
    </>
  );
}

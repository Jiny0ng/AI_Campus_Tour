"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { readNarrationEvents, readVisitedPlaces } from "@/lib/audioGuide/sessionReport";
import type { TourNarrationEvent } from "@/types/audioGuide";
import type { TourSummaryData } from "@/types";
import { TourSummaryTipCard } from "./TourSummaryTipCard";

type TourSummaryScreenProps = {
  data: TourSummaryData;
};

export function TourSummaryScreen({ data }: TourSummaryScreenProps) {
  const router = useRouter();
  const { t, pn } = useAppSettings();
  const [narrations, setNarrations] = useState<TourNarrationEvent[]>([]);
  const [visitedPlaces, setVisitedPlaces] = useState<string[]>(data.visitedPlaces);

  useEffect(() => {
    setNarrations(readNarrationEvents().filter((event) => event.includeInReport));
    const visited = readVisitedPlaces().map((place) => place.name);
    if (visited.length > 0) setVisitedPlaces(visited);
  }, []);

  return (
    <MobileShell className="bg-surface">
      <main className="flex min-h-dvh flex-col bg-surface px-5 pb-[calc(26px+env(safe-area-inset-bottom))] pt-8">
        <section className="flex-1">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-primary" />
            <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-ink">
              {t("summary.title")}
            </h1>
          </div>

          <section className="mt-7">
            <h2 className="text-sm font-extrabold text-ink">{t("summary.visited")}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {visitedPlaces.map((place) => (
                <span
                  key={place}
                  className="inline-flex h-[31px] items-center gap-1.5 rounded-full border border-primary bg-primary-soft/40 px-3 text-xs font-extrabold text-primary"
                >
                  <MapPin size={13} />
                  {pn(place)}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-extrabold text-ink">{t("summary.tips")}</h2>
            <div className="mt-3 space-y-2.5">
              {data.tips.map((tip) => (
                <TourSummaryTipCard
                  key={tip.id}
                  tip={{
                    ...tip,
                    title: t(`summary.${tip.id}.title`),
                    description: t(`summary.${tip.id}.description`),
                  }}
                />
              ))}
            </div>
          </section>

          {narrations.length > 0 ? (
            <section className="mt-5">
              <h2 className="text-sm font-extrabold text-ink">{t("summary.narrations")}</h2>
              <div className="mt-3 space-y-2.5">
                {narrations.map((event) => (
                  <article key={event.id} className="rounded-card border border-line bg-primary-soft/40 p-4">
                    {event.placeName ? (
                      <h3 className="text-sm font-extrabold text-primary">{pn(event.placeName)}</h3>
                    ) : null}
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-ink/80">{event.text}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          className="mt-6 h-12 rounded-card text-base"
          onClick={() => router.push(APP_ROUTES.home)}
        >
          {t("summary.home")}
        </Button>
      </main>
    </MobileShell>
  );
}

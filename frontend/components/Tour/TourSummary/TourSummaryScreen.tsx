"use client";

import { useRouter } from "next/navigation";
import { MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/Common";
import { MobileShell } from "@/components/Layout";
import { APP_ROUTES } from "@/constants/routes";
import type { TourSummaryData } from "@/types";
import { TourSummaryTipCard } from "./TourSummaryTipCard";

type TourSummaryScreenProps = {
  data: TourSummaryData;
};

export function TourSummaryScreen({ data }: TourSummaryScreenProps) {
  const router = useRouter();

  return (
    <MobileShell className="bg-surface">
      <main className="flex min-h-dvh flex-col bg-surface px-5 pb-[calc(26px+env(safe-area-inset-bottom))] pt-[63px]">
        <section className="flex-1">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-primary" />
            <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-ink">
              {data.title}
            </h1>
          </div>

          <section className="mt-7">
            <h2 className="text-sm font-extrabold text-ink">오늘 방문한 장소</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.visitedPlaces.map((place) => (
                <span
                  key={place}
                  className="inline-flex h-[31px] items-center gap-1.5 rounded-full border border-primary bg-primary-soft/40 px-3 text-xs font-extrabold text-primary"
                >
                  <MapPin size={13} />
                  {place}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-extrabold text-ink">핵심 요약 팁</h2>
            <div className="mt-3 space-y-2.5">
              {data.tips.map((tip) => (
                <TourSummaryTipCard key={tip.id} tip={tip} />
              ))}
            </div>
          </section>
        </section>

        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          className="mt-6 h-12 rounded-card text-base"
          onClick={() => router.push(APP_ROUTES.home)}
        >
          처음 화면으로 돌아가기
        </Button>
      </main>
    </MobileShell>
  );
}

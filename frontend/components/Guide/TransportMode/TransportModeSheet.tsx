"use client";

import { MapPin, Navigation, Sparkles } from "lucide-react";
import { Button, BottomSheet } from "@/components/Common";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import type { GuidePlace } from "@/types";
import { TransportMode, TransportOption, TransportOptionGroup } from "./TransportOptionGroup";

type TransportModeSheetProps = {
  destination: GuidePlace;
  options: TransportOption[];
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  onStart: () => void;
  nearbyPlaces?: GuidePlace[];
  onSelectNearby?: (place: GuidePlace) => void;
};

function cleanDescription(destination: GuidePlace) {
  const fallbackDescriptions: Array<[RegExp, string]> = [
    [/신정문/, "전북대학교의 정문으로, 전통 한옥 형태가 돋보이는 캠퍼스의 첫인상이에요."],
    [/인터내셔널|실크로드/, "국제교류와 유학생 지원이 이루어지는 공간으로, 학습과 휴식에도 자주 쓰여요."],
    [/대학본부/, "전북대학교의 주요 행정 업무가 모이는 중심 건물이에요."],
    [/진수당/, "강연, 세미나, 식당과 편의시설이 함께 있는 복합 공간이에요."],
    [/공대|공과/, "공과대학 권역으로 들어가는 기준점이라 길 찾기에도 좋은 장소예요."],
    [/중앙도서관/, "자료 이용과 열람, 공부를 위해 학생들이 많이 찾는 대표 학습 공간이에요."],
    [/건지광장/, "캠퍼스 중심부에 있는 광장으로 만남과 이동의 기준점이 되는 곳이에요."],
    [/대운동장/, "행사와 체육 활동이 열리는 넓은 야외 공간이에요."],
    [/농구장/, "학생들이 자유롭게 운동하고 쉬어갈 수 있는 야외 체육 공간이에요."],
    [/박물관/, "전북대학교의 역사와 문화를 함께 둘러볼 수 있는 문화 공간이에요."],
    [/학생타운|후생관/, "식사와 편의시설을 찾을 때 들르기 좋은 학생 생활 공간이에요."],
    [/구정문/, "학생들의 약속 장소로 자주 쓰이는 캠퍼스 주변 대표 지점이에요."],
  ];
  const description = destination.description.trim();
  if (description && !description.endsWith("위치 안내")) return description;
  return fallbackDescriptions.find(([pattern]) => pattern.test(destination.name))?.[1]
    ?? `${destination.name}은 전북대학교 안에서 목적지로 자주 찾는 장소예요.`;
}

function placeTips(destination: GuidePlace) {
  const categoryTip = destination.category === "cafe" || destination.category === "convenience"
    ? "운영 시간과 혼잡도를 확인하고 들르면 이동 중 쉬어가기 좋아요."
    : destination.category === "parking"
      ? "차량 이동 중이라면 입구와 출구 방향을 먼저 확인하면 좋아요."
      : destination.category === "rest"
        ? "이동 중 잠깐 쉬거나 주변 풍경을 보기 좋은 포인트예요."
        : "도착 후에는 주변 건물과 이어지는 보행 동선을 같이 확인하면 좋아요.";
  return [
    {
      title: "도착 포인트",
      description: `${destination.name} 근처에 도착하면 지도 핀과 건물 입구 방향을 함께 확인해보세요.`,
    },
    {
      title: "이용 팁",
      description: categoryTip,
    },
  ];
}

export function TransportModeSheet({
  destination,
  options,
  selectedMode,
  onSelectMode,
  onStart,
  nearbyPlaces = [],
  onSelectNearby,
}: TransportModeSheetProps) {
  const { t } = useAppSettings();
  const description = cleanDescription(destination);

  return (
    <BottomSheet
      showHandle={false}
      className="pointer-events-auto max-h-[58dvh] overflow-y-auto rounded-t-[18px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4"
    >
      <p className="text-xs font-extrabold text-primary">{t("guide.destination")}</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-8 text-ink">{destination.name}</h1>
      <p className="mt-2 rounded-card bg-white px-3 py-2 text-xs font-semibold leading-5 text-ink/75 shadow-sm">
        {description}
      </p>

      <section className="mt-4 rounded-card border border-primary/20 bg-primary-soft p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary">
          <Sparkles size={17} />
          <span>{t("guide.placeTips")}</span>
        </div>
        <div className="grid gap-2">
          {placeTips(destination).map((tip) => (
            <article key={tip.title} className="rounded-card bg-white p-3 shadow-sm">
              <p className="text-xs font-extrabold text-ink">{tip.title}</p>
              <p className="mt-1 text-xs font-medium leading-5 text-muted">{tip.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-4 border-t border-line pt-4">
        <h2 className="text-sm font-extrabold text-ink">{t("sheet.nearby")}</h2>
        {nearbyPlaces.length > 0 ? (
          <div className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1">
            {nearbyPlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => onSelectNearby?.(place)}
                className="w-[196px] shrink-0 rounded-card border border-line bg-surface p-3 text-left shadow-card transition active:scale-[0.99]"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
                  <MapPin size={16} />
                </span>
                <span className="mt-2 block truncate text-sm font-extrabold text-ink">{place.name}</span>
                <span className="mt-1 line-clamp-2 h-8 text-xs font-medium text-muted">
                  {place.description}
                </span>
                <span className="mt-2 flex items-center gap-1 text-xs font-bold text-primary">
                  <Navigation size={13} /> {t("guide.distanceApprox")} {place.distanceMeters}m
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs font-medium text-muted">{t("sheet.noNearby")}</p>
        )}
      </section>

      <h2 className="mt-4 text-lg font-extrabold text-ink">{t("guide.transport.title")}</h2>
      <div className="mt-3">
        <TransportOptionGroup
          options={options}
          selectedMode={selectedMode}
          onSelectMode={onSelectMode}
        />
      </div>
      <Button type="button" size="lg" fullWidth className="mt-4" onClick={onStart}>
        {t(`guide.start.${selectedMode}`)}
      </Button>
    </BottomSheet>
  );
}

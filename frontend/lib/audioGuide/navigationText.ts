import type { AppLocale } from "@/contexts/AppSettingsContext";
import type { DrivingGuide } from "@/types";

export type Maneuver =
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "uturn"
  | "arrive";

const DISTANCE_BUCKETS = [30, 50, 100, 200, 300, 500] as const;

const phrases: Record<AppLocale, Record<Maneuver, (distance: string) => string>> = {
  ko: {
    straight: () => "계속 직진하세요.",
    "slight-left": (d) => `${d} 앞에서 왼쪽 방향으로 진행하세요.`,
    left: (d) => `${d} 앞에서 좌회전하세요.`,
    "sharp-left": (d) => `${d} 앞에서 크게 좌회전하세요.`,
    "slight-right": (d) => `${d} 앞에서 오른쪽 방향으로 진행하세요.`,
    right: (d) => `${d} 앞에서 우회전하세요.`,
    "sharp-right": (d) => `${d} 앞에서 크게 우회전하세요.`,
    uturn: (d) => `${d} 앞에서 유턴하세요.`,
    arrive: () => "목적지에 도착했습니다.",
  },
  en: {
    straight: () => "Continue straight.",
    "slight-left": (d) => `Keep slightly left ${d}.`,
    left: (d) => `Turn left ${d}.`,
    "sharp-left": (d) => `Make a sharp left ${d}.`,
    "slight-right": (d) => `Keep slightly right ${d}.`,
    right: (d) => `Turn right ${d}.`,
    "sharp-right": (d) => `Make a sharp right ${d}.`,
    uturn: (d) => `Make a U-turn ${d}.`,
    arrive: () => "You have arrived at your destination.",
  },
  ja: {
    straight: () => "そのまま直進してください。",
    "slight-left": (d) => `${d}先を左方向へ進んでください。`,
    left: (d) => `${d}先を左折してください。`,
    "sharp-left": (d) => `${d}先を大きく左折してください。`,
    "slight-right": (d) => `${d}先を右方向へ進んでください。`,
    right: (d) => `${d}先を右折してください。`,
    "sharp-right": (d) => `${d}先を大きく右折してください。`,
    uturn: (d) => `${d}先でUターンしてください。`,
    arrive: () => "目的地に到着しました。",
  },
  zh: {
    straight: () => "请继续直行。",
    "slight-left": (d) => `请在${d}后向左前方行驶。`,
    left: (d) => `请在${d}后左转。`,
    "sharp-left": (d) => `请在${d}后大幅左转。`,
    "slight-right": (d) => `请在${d}后向右前方行驶。`,
    right: (d) => `请在${d}后右转。`,
    "sharp-right": (d) => `请在${d}后大幅右转。`,
    uturn: (d) => `请在${d}后掉头。`,
    arrive: () => "您已到达目的地。",
  },
};

const nearPhrases: Record<AppLocale, Record<Maneuver, string>> = {
  ko: {
    straight: "계속 직진하세요.",
    "slight-left": "잠시 후 왼쪽 방향으로 진행하세요.",
    left: "잠시 후 좌회전하세요.",
    "sharp-left": "잠시 후 크게 좌회전하세요.",
    "slight-right": "잠시 후 오른쪽 방향으로 진행하세요.",
    right: "잠시 후 우회전하세요.",
    "sharp-right": "잠시 후 크게 우회전하세요.",
    uturn: "잠시 후 유턴하세요.",
    arrive: "목적지에 도착했습니다.",
  },
  en: {
    straight: "Continue straight.",
    "slight-left": "Keep slightly left shortly.",
    left: "Turn left shortly.",
    "sharp-left": "Make a sharp left shortly.",
    "slight-right": "Keep slightly right shortly.",
    right: "Turn right shortly.",
    "sharp-right": "Make a sharp right shortly.",
    uturn: "Make a U-turn shortly.",
    arrive: "You have arrived at your destination.",
  },
  ja: {
    straight: "そのまま直進してください。",
    "slight-left": "まもなく左方向へ進んでください。",
    left: "まもなく左折してください。",
    "sharp-left": "まもなく大きく左折してください。",
    "slight-right": "まもなく右方向へ進んでください。",
    right: "まもなく右折してください。",
    "sharp-right": "まもなく大きく右折してください。",
    uturn: "まもなくUターンしてください。",
    arrive: "目的地に到着しました。",
  },
  zh: {
    straight: "请继续直行。",
    "slight-left": "即将向左前方行驶。",
    left: "即将左转。",
    "sharp-left": "即将大幅左转。",
    "slight-right": "即将向右前方行驶。",
    right: "即将右转。",
    "sharp-right": "即将大幅右转。",
    uturn: "即将掉头。",
    arrive: "您已到达目的地。",
  },
};

export function distanceBucket(distanceMeters: number) {
  if (distanceMeters < 20) return null;
  return DISTANCE_BUCKETS.reduce((closest, candidate) => (
    Math.abs(candidate - distanceMeters) < Math.abs(closest - distanceMeters)
      ? candidate
      : closest
  ));
}

export function maneuverFromGuide(guide: DrivingGuide): Maneuver {
  if (guide.type === 88) return "arrive";
  const localTypes: Partial<Record<number, Maneuver>> = {
    101: "straight",
    102: "slight-left",
    103: "left",
    104: "sharp-left",
    105: "slight-right",
    106: "right",
    107: "sharp-right",
    108: "uturn",
  };
  if (localTypes[guide.type]) return localTypes[guide.type] as Maneuver;
  const value = guide.instruction.toLowerCase();
  if (/유턴|u-turn|uturn|掉头|uターン/.test(value)) return "uturn";
  if (/크게.*좌|sharp left/.test(value)) return "sharp-left";
  if (/크게.*우|sharp right/.test(value)) return "sharp-right";
  if (/완만하게.*왼|slight left/.test(value)) return "slight-left";
  if (/완만하게.*오른|slight right/.test(value)) return "slight-right";
  if (/좌측|왼쪽|좌회전|left|左/.test(value)) return "left";
  if (/우측|오른쪽|우회전|right|右/.test(value)) return "right";
  return "straight";
}

export function navigationSpeech(
  guide: DrivingGuide,
  distanceMeters: number,
  locale: AppLocale,
) {
  const maneuver = maneuverFromGuide(guide);
  const bucket = distanceBucket(distanceMeters);
  const distance = bucket === null
    ? ""
    : locale === "ko"
      ? `${bucket}미터`
      : locale === "en"
        ? `in ${bucket} meters`
        : locale === "ja"
          ? `${bucket}メートル`
          : `${bucket}米`;
  return {
    maneuver,
    bucket,
    text: bucket === null ? nearPhrases[locale][maneuver] : phrases[locale][maneuver](distance),
    assetId: `navigation:${maneuver}:${locale}${bucket ? `:${bucket}` : ""}`,
  };
}

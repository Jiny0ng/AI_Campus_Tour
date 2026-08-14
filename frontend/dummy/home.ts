import { APP_ROUTES } from "@/constants/routes";
import type { HomeServiceOption } from "@/types";

export const homeServiceOptions: HomeServiceOption[] = [
  {
    id: "tour",
    title: "캠퍼스 투어",
    description: "오리엔테이션 · 추천 코스 · 개인 맞춤형",
    href: APP_ROUTES.tourSetup,
  },
  {
    id: "guide",
    title: "캠퍼스 안내",
    description: "원하는 장소 검색 · 길찾기 · 편의시설 탐색",
    href: APP_ROUTES.guide,
  },
];

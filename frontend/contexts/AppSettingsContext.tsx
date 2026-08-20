"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppLocale = "ko" | "en" | "ja" | "zh";

export const localeOptions: Array<{ value: AppLocale; label: string }> = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

const messages: Record<AppLocale, Record<string, string>> = {
  ko: {
    "home.prompt": "원하는 서비스를\n선택해주세요.",
    "home.tour.title": "캠퍼스 투어",
    "home.tour.description": "주요 명소를 따라가는 캠퍼스 투어",
    "home.guide.title": "캠퍼스 안내",
    "home.guide.description": "원하는 장소 검색 · 길찾기 · 편의시설 탐색",
    "tour.back": "뒤로가기",
    "settings.open": "환경설정 열기",
    "settings.close": "환경설정 닫기",
    "settings.sound": "음소거",
    "settings.soundOn": "소리 켜기",
    "settings.language": "언어 설정",
    "sheet.loading": "AI 도슨트가 주변 정보와 꿀팁을 탐색 중입니다...",
    "sheet.open": "눌러서 주변 정보 및 꿀팁 보기",
    "sheet.tips": "경로 꿀팁 & 주변 정보",
    "sheet.noTips": "이 구간의 특별한 꿀팁이 없습니다.",
    "sheet.nearby": "주변 가볼만한 곳",
    "sheet.adding": "추가 중",
    "sheet.detour": "경유하기",
    "sheet.noNearby": "현재 위치 100m 이내에 추천 스팟이 없습니다.",
    "sheet.tipDetails": "AI 도슨트 상세 정보",
    "sheet.closeDetails": "상세 정보 닫기",
    "tour.remaining": "남은 거리",
    "tour.arrived": "목적지에 도착했습니다",
    "tour.finish": "투어 종료",
    "tour.next": "다음 목적지",
    "tour.previous": "이전 코스",
    "map.recenter": "현위치로 지도 재정렬",
    "summary.title": "투어 요약 리포트",
    "summary.visited": "오늘 방문한 장소",
    "summary.tips": "핵심 요약 팁",
    "summary.home": "처음 화면으로 돌아가기",
    "summary.library-mobile-pass.title": "도서관 모바일 입장",
    "summary.library-mobile-pass.description": "JBNU 앱 모바일 QR코드 인식 필수",
    "summary.student-cafeteria.title": "학생식당 이용 팁",
    "summary.student-cafeteria.description": "진수당 식당은 오전 11:30부터 매우 혼잡",
    "summary.campus-shuttle.title": "교내 무료 순환버스",
    "summary.campus-shuttle.description": "운행 시간표를 미리 확인하세요.",
  },
  en: {
    "home.prompt": "Choose a service\nto get started.",
    "home.tour.title": "Campus Tour",
    "home.tour.description": "Follow one route through key campus landmarks",
    "home.guide.title": "Campus Guide",
    "home.guide.description": "Search places · Directions · Facilities",
    "tour.back": "Go back",
    "settings.open": "Open settings",
    "settings.close": "Close settings",
    "settings.sound": "Mute",
    "settings.soundOn": "Turn sound on",
    "settings.language": "Language",
    "sheet.loading": "The AI docent is finding nearby information and tips...",
    "sheet.open": "Tap to view nearby information and tips",
    "sheet.tips": "Route tips & nearby information",
    "sheet.noTips": "There are no special tips for this section.",
    "sheet.nearby": "Places worth visiting nearby",
    "sheet.adding": "Adding",
    "sheet.detour": "Add stop",
    "sheet.noNearby": "No recommended spots were found within 100m.",
    "sheet.tipDetails": "AI docent details",
    "sheet.closeDetails": "Close details",
    "tour.remaining": "Remaining",
    "tour.arrived": "You have arrived",
    "tour.finish": "Finish tour",
    "tour.next": "Next destination",
    "tour.previous": "Previous stop",
    "map.recenter": "Recenter map on my location",
    "summary.title": "Tour summary",
    "summary.visited": "Places visited today",
    "summary.tips": "Key tips",
    "summary.home": "Return to home",
    "summary.library-mobile-pass.title": "Mobile library entry",
    "summary.library-mobile-pass.description": "Use the mobile QR code in the JBNU app.",
    "summary.student-cafeteria.title": "Student cafeteria tip",
    "summary.student-cafeteria.description": "Jinsudang cafeteria gets busy after 11:30 AM.",
    "summary.campus-shuttle.title": "Free campus shuttle",
    "summary.campus-shuttle.description": "Check the timetable before boarding.",
  },
  ja: {
    "home.prompt": "ご希望のサービスを\n選択してください。",
    "home.tour.title": "キャンパスツアー",
    "home.tour.description": "主要スポットを巡るキャンパスツアー",
    "home.guide.title": "キャンパス案内",
    "home.guide.description": "場所検索・経路案内・施設検索",
    "tour.back": "戻る",
    "settings.open": "設定を開く",
    "settings.close": "設定を閉じる",
    "settings.sound": "ミュート",
    "settings.soundOn": "音をオンにする",
    "settings.language": "言語設定",
    "sheet.loading": "AIドーセントが周辺情報とヒントを検索しています...",
    "sheet.open": "タップして周辺情報とヒントを見る",
    "sheet.tips": "ルートのヒント・周辺情報",
    "sheet.noTips": "この区間には特別なヒントがありません。",
    "sheet.nearby": "周辺のおすすめスポット",
    "sheet.adding": "追加中",
    "sheet.detour": "経由する",
    "sheet.noNearby": "現在地から100m以内におすすめスポットはありません。",
    "sheet.tipDetails": "AIドーセント詳細",
    "sheet.closeDetails": "詳細を閉じる",
    "tour.remaining": "残り",
    "tour.arrived": "目的地に到着しました",
    "tour.finish": "ツアー終了",
    "tour.next": "次の目的地",
    "tour.previous": "前のコース",
    "map.recenter": "現在地に戻る",
    "summary.title": "ツアー概要",
    "summary.visited": "今日訪れた場所",
    "summary.tips": "重要なヒント",
    "summary.home": "最初の画面に戻る",
    "summary.library-mobile-pass.title": "図書館のモバイル入館",
    "summary.library-mobile-pass.description": "JBNUアプリのモバイルQRコードが必要です。",
    "summary.student-cafeteria.title": "学生食堂のヒント",
    "summary.student-cafeteria.description": "進修堂食堂は11時30分以降混雑します。",
    "summary.campus-shuttle.title": "無料キャンパスバス",
    "summary.campus-shuttle.description": "乗車前に時刻表をご確認ください。",
  },
  zh: {
    "home.prompt": "请选择您需要的\n服务。",
    "home.tour.title": "校园导览",
    "home.tour.description": "沿固定路线游览校园主要景点",
    "home.guide.title": "校园指南",
    "home.guide.description": "地点搜索 · 路线导航 · 设施查询",
    "tour.back": "返回",
    "settings.open": "打开设置",
    "settings.close": "关闭设置",
    "settings.sound": "静音",
    "settings.soundOn": "开启声音",
    "settings.language": "语言设置",
    "sheet.loading": "AI讲解员正在查找周边信息和提示...",
    "sheet.open": "点击查看周边信息和提示",
    "sheet.tips": "路线提示与周边信息",
    "sheet.noTips": "此路段暂无特别提示。",
    "sheet.nearby": "附近值得一去的地方",
    "sheet.adding": "添加中",
    "sheet.detour": "加入途经点",
    "sheet.noNearby": "当前位置100米内没有推荐景点。",
    "sheet.tipDetails": "AI讲解详情",
    "sheet.closeDetails": "关闭详情",
    "tour.remaining": "剩余距离",
    "tour.arrived": "已到达目的地",
    "tour.finish": "结束导览",
    "tour.next": "下一个目的地",
    "tour.previous": "上一站",
    "map.recenter": "回到当前位置",
    "summary.title": "导览总结",
    "summary.visited": "今天到访的地点",
    "summary.tips": "重点提示",
    "summary.home": "返回首页",
    "summary.library-mobile-pass.title": "图书馆手机入馆",
    "summary.library-mobile-pass.description": "需要使用JBNU应用中的手机二维码。",
    "summary.student-cafeteria.title": "学生食堂提示",
    "summary.student-cafeteria.description": "进修堂食堂上午11:30后较为拥挤。",
    "summary.campus-shuttle.title": "免费校园巴士",
    "summary.campus-shuttle.description": "乘车前请确认时刻表。",
  },
};

type AppSettingsValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  volume: number;
  isMuted: boolean;
  toggleMute: () => void;
  t: (key: string) => string;
};

const AppSettingsContext = createContext<AppSettingsValue | null>(null);
const SETTINGS_KEY = "campus-tour-settings";

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("ko");
  const [volume, setVolume] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const previousVolume = useRef(1);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as {
        locale?: AppLocale;
        volume?: number;
        previousVolume?: number;
      } | null;
      if (stored?.locale && localeOptions.some((option) => option.value === stored.locale)) {
        setLocaleState(stored.locale);
      }
      if (typeof stored?.volume === "number") {
        setVolume(Math.min(1, Math.max(0, stored.volume)));
      }
      if (typeof stored?.previousVolume === "number" && stored.previousVolume > 0) {
        previousVolume.current = Math.min(1, stored.previousVolume);
      }
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!hydrated) return;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ locale, volume, previousVolume: previousVolume.current }),
    );
  }, [hydrated, locale, volume]);

  useEffect(() => {
    const applyVolume = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => {
        media.volume = volume;
        media.muted = volume === 0;
      });
    };
    applyVolume();
    const observer = new MutationObserver(() => applyVolume());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [volume]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const toggleMute = useCallback(() => {
    setVolume((currentVolume) => {
      if (currentVolume > 0) {
        previousVolume.current = currentVolume;
        return 0;
      }
      return previousVolume.current || 1;
    });
  }, []);

  const t = useCallback(
    (key: string) => messages[locale][key] ?? messages.ko[key] ?? key,
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, volume, isMuted: volume === 0, toggleMute, t }),
    [locale, setLocale, toggleMute, t, volume],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }
  return context;
}

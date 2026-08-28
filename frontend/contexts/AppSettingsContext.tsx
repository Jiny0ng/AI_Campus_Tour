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
import { useRouter } from "next/navigation";
import { translateProperNoun } from "@/lib/properNouns";

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
    "settings.languageReplay": "언어가 변경되었습니다. 현재 장소의 설명을 선택한 언어로 다시 들으시겠어요?",
    "sheet.loading": "AI 도슨트가 주변 정보와 꿀팁을 탐색 중입니다...",
    "sheet.open": "눌러서 주변 정보 및 꿀팁 보기",
    "sheet.tips": "경로 꿀팁 & 주변 정보",
    "sheet.placeTips": "장소 꿀팁",
    "sheet.noTips": "이 장소에 준비된 꿀팁이 없습니다.",
    "sheet.nearby": "주변 가볼만한 곳",
    "sheet.adding": "추가 중",
    "sheet.detour": "경유하기",
    "sheet.noNearby": "목적지 주변 200m 이내에 추천 장소가 없습니다.",
    "sheet.tipDetails": "AI 도슨트 상세 정보",
    "sheet.nearbyDetails": "상세 정보",
    "sheet.closeDetails": "상세 정보 닫기",
    "audio.listen": "듣기",
    "audio.pause": "일시정지",
    "audio.resume": "계속 듣기",
    "tour.remaining": "남은 거리",
    "tour.arrived": "목적지에 도착했습니다",
    "tour.confirmArrival": "도착 확인",
    "tour.finish": "투어 종료",
    "tour.next": "다음 목적지",
    "tour.previous": "이전 코스",
    "map.recenter": "현위치로 지도 재정렬",
    "map.orientation": "지도 방향",
    "guide.back": "뒤로가기",
    "guide.searchPlaceholder": "건물, 시설, 편의점 검색...",
    "guide.popular.title": "많이 찾는 장소",
    "guide.popular.description": "학생들이 자주 이용하는 목적지예요.",
    "guide.purpose.study": "공부",
    "guide.purpose.rest": "휴식",
    "guide.purpose.convenience": "편의",
    "guide.purpose.convenience_store": "편의점",
    "guide.purpose.cafe": "카페",
    "guide.purpose.food": "식당",
    "guide.purpose.parking": "주차장",
    "guide.direct": "바로안내",
    "guide.details": "시설·장소 정보",
    "guide.noPurposeResults": "조건에 맞는 시설 정보를 찾지 못했습니다.",
    "guide.distanceApprox": "약",
    "guide.minutes": "분",
    "guide.mode.walk": "도보 (걷기)",
    "guide.mode.bike": "자전거",
    "guide.mode.car": "차량",
    "guide.modeLabel.walk": "도보",
    "guide.modeLabel.bike": "자전거",
    "guide.modeLabel.car": "차량",
    "guide.destination": "목적지",
    "guide.placeTips": "장소 꿀팁",
    "guide.transport.title": "어떻게 이동하시겠어요?",
    "guide.start.walk": "도보 안내 시작하기",
    "guide.start.bike": "자전거 안내 시작하기",
    "guide.start.car": "차량 안내 시작하기",
    "guide.routeError": "{mode} 경로를 불러오지 못했습니다.",
    "guide.gpsUnavailable": "GPS를 사용할 수 없어 마지막 위치로 안내합니다.",
    "guide.gpsPermission": "GPS 권한을 허용하면 실시간 재탐색을 사용할 수 있습니다.",
    "guide.remaining": "{distance} 남음",
    "guide.routeLoading": "{mode} 경로를 찾는 중입니다",
    "guide.routeFollow": "경로를 따라 진행하세요",
    "guide.arrived": "목적지 도착",
    "guide.ahead": "{distance} 앞",
    "guide.wait": "잠시만 기다려 주세요",
    "guide.gpsChecking": "GPS 위치 확인 중",
    "guide.destinationSummary": "{destination}까지 {mode} {minutes}분",
    "guide.arrival": "도착 {time}",
    "guide.changeDestination": "목적지 변경",
    "guide.end": "안내 종료",
    "audio.start": "음성 안내 시작",
    "audio.textMode": "텍스트 안내",
    "audio.unstable": "연결 불안정",
    "summary.title": "투어 요약 리포트",
    "summary.visited": "오늘 방문한 장소",
    "summary.tips": "핵심 요약 팁",
    "summary.narrations": "오늘 들은 도슨트",
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
    "settings.languageReplay": "The language has changed. Would you like to replay the current place description in English?",
    "sheet.loading": "The AI docent is finding nearby information and tips...",
    "sheet.open": "Tap to view nearby information and tips",
    "sheet.tips": "Route tips & nearby information",
    "sheet.placeTips": "Place tips",
    "sheet.noTips": "There are no prepared insights for this place.",
    "sheet.nearby": "Places worth visiting nearby",
    "sheet.adding": "Adding",
    "sheet.detour": "Add stop",
    "sheet.noNearby": "No recommended places were found within 200m of the destination.",
    "sheet.tipDetails": "AI docent details",
    "sheet.nearbyDetails": "Details",
    "sheet.closeDetails": "Close details",
    "audio.listen": "Listen",
    "audio.pause": "Pause",
    "audio.resume": "Resume",
    "tour.remaining": "Remaining",
    "tour.arrived": "You have arrived",
    "tour.confirmArrival": "Confirm arrival",
    "tour.finish": "Finish tour",
    "tour.next": "Next destination",
    "tour.previous": "Previous stop",
    "map.recenter": "Recenter map on my location",
    "map.orientation": "Map direction",
    "guide.back": "Go back",
    "guide.searchPlaceholder": "Search buildings, facilities, stores...",
    "guide.popular.title": "Popular places",
    "guide.popular.description": "Destinations students often use.",
    "guide.purpose.study": "Study",
    "guide.purpose.rest": "Rest",
    "guide.purpose.convenience": "Convenience",
    "guide.purpose.convenience_store": "Convenience store",
    "guide.purpose.cafe": "Café",
    "guide.purpose.food": "Dining",
    "guide.purpose.parking": "Parking",
    "guide.direct": "Directions",
    "guide.details": "Facility details",
    "guide.noPurposeResults": "No matching facility information was found.",
    "guide.distanceApprox": "About",
    "guide.minutes": "min",
    "guide.mode.walk": "Walk",
    "guide.mode.bike": "Bike",
    "guide.mode.car": "Car",
    "guide.modeLabel.walk": "walking",
    "guide.modeLabel.bike": "by bike",
    "guide.modeLabel.car": "by car",
    "guide.destination": "Destination",
    "guide.placeTips": "Place tips",
    "guide.transport.title": "How would you like to go?",
    "guide.start.walk": "Start walking directions",
    "guide.start.bike": "Start bike directions",
    "guide.start.car": "Start driving directions",
    "guide.routeError": "Could not load the {mode} route.",
    "guide.gpsUnavailable": "GPS is unavailable, so guidance uses your last location.",
    "guide.gpsPermission": "Allow GPS to use live rerouting.",
    "guide.remaining": "{distance} left",
    "guide.routeLoading": "Finding a {mode} route",
    "guide.routeFollow": "Follow the route",
    "guide.arrived": "Arrived",
    "guide.ahead": "{distance} ahead",
    "guide.wait": "Please wait",
    "guide.gpsChecking": "Checking GPS location",
    "guide.destinationSummary": "{minutes} min {mode} to {destination}",
    "guide.arrival": "Arrive {time}",
    "guide.changeDestination": "Change destination",
    "guide.end": "End guidance",
    "audio.start": "Start voice guidance",
    "audio.textMode": "Text guidance",
    "audio.unstable": "Unstable connection",
    "summary.title": "Tour summary",
    "summary.visited": "Places visited today",
    "summary.tips": "Key tips",
    "summary.narrations": "Docent highlights",
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
    "settings.languageReplay": "言語が変更されました。現在の場所の説明を日本語でもう一度聞きますか？",
    "sheet.loading": "AIドーセントが周辺情報とヒントを検索しています...",
    "sheet.open": "タップして周辺情報とヒントを見る",
    "sheet.tips": "ルートのヒント・周辺情報",
    "sheet.placeTips": "場所のヒント",
    "sheet.noTips": "このスポットには準備されたヒントがありません。",
    "sheet.nearby": "周辺のおすすめスポット",
    "sheet.adding": "追加中",
    "sheet.detour": "経由する",
    "sheet.noNearby": "目的地から200m以内におすすめスポットはありません。",
    "sheet.tipDetails": "AIドーセント詳細",
    "sheet.nearbyDetails": "詳細情報",
    "sheet.closeDetails": "詳細を閉じる",
    "audio.listen": "聞く",
    "audio.pause": "一時停止",
    "audio.resume": "再開",
    "tour.remaining": "残り",
    "tour.arrived": "目的地に到着しました",
    "tour.confirmArrival": "到着を確認",
    "tour.finish": "ツアー終了",
    "tour.next": "次の目的地",
    "tour.previous": "前のコース",
    "map.recenter": "現在地に戻る",
    "map.orientation": "地図の向き",
    "guide.back": "戻る",
    "guide.searchPlaceholder": "建物・施設・売店を検索...",
    "guide.popular.title": "よく探される場所",
    "guide.popular.description": "学生がよく利用する目的地です。",
    "guide.purpose.study": "勉強",
    "guide.purpose.rest": "休憩",
    "guide.purpose.convenience": "便利施設",
    "guide.purpose.convenience_store": "コンビニ",
    "guide.purpose.cafe": "カフェ",
    "guide.purpose.food": "食堂",
    "guide.purpose.parking": "駐車場",
    "guide.direct": "すぐ案内",
    "guide.details": "施設・場所情報",
    "guide.noPurposeResults": "条件に合う施設情報が見つかりませんでした。",
    "guide.distanceApprox": "約",
    "guide.minutes": "分",
    "guide.mode.walk": "徒歩",
    "guide.mode.bike": "自転車",
    "guide.mode.car": "車",
    "guide.modeLabel.walk": "徒歩",
    "guide.modeLabel.bike": "自転車",
    "guide.modeLabel.car": "車",
    "guide.destination": "目的地",
    "guide.placeTips": "場所のヒント",
    "guide.transport.title": "どの方法で移動しますか？",
    "guide.start.walk": "徒歩案内を開始",
    "guide.start.bike": "自転車案内を開始",
    "guide.start.car": "車の案内を開始",
    "guide.routeError": "{mode}ルートを読み込めませんでした。",
    "guide.gpsUnavailable": "GPSを使用できないため、最後の位置で案内します。",
    "guide.gpsPermission": "GPS権限を許可するとリアルタイム再探索を利用できます。",
    "guide.remaining": "残り{distance}",
    "guide.routeLoading": "{mode}ルートを検索中です",
    "guide.routeFollow": "ルートに沿って進んでください",
    "guide.arrived": "目的地に到着",
    "guide.ahead": "{distance}先",
    "guide.wait": "しばらくお待ちください",
    "guide.gpsChecking": "GPS位置を確認中",
    "guide.destinationSummary": "{destination}まで{mode} {minutes}分",
    "guide.arrival": "{time}到着",
    "guide.changeDestination": "目的地を変更",
    "guide.end": "案内終了",
    "audio.start": "音声案内を開始",
    "audio.textMode": "テキスト案内",
    "audio.unstable": "接続が不安定です",
    "summary.title": "ツアー概要",
    "summary.visited": "今日訪れた場所",
    "summary.tips": "重要なヒント",
    "summary.narrations": "今日の音声ガイド",
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
    "settings.languageReplay": "语言已更改。是否使用简体中文重新播放当前地点的讲解？",
    "sheet.loading": "AI讲解员正在查找周边信息和提示...",
    "sheet.open": "点击查看周边信息和提示",
    "sheet.tips": "路线提示与周边信息",
    "sheet.placeTips": "地点提示",
    "sheet.noTips": "此地点暂无准备好的贴士。",
    "sheet.nearby": "附近值得一去的地方",
    "sheet.adding": "添加中",
    "sheet.detour": "加入途经点",
    "sheet.noNearby": "目的地周边200米内没有推荐地点。",
    "sheet.tipDetails": "AI讲解详情",
    "sheet.nearbyDetails": "详细信息",
    "sheet.closeDetails": "关闭详情",
    "audio.listen": "收听",
    "audio.pause": "暂停",
    "audio.resume": "继续播放",
    "tour.remaining": "剩余距离",
    "tour.arrived": "已到达目的地",
    "tour.confirmArrival": "确认到达",
    "tour.finish": "结束导览",
    "tour.next": "下一个目的地",
    "tour.previous": "上一站",
    "map.recenter": "回到当前位置",
    "map.orientation": "地图方向",
    "guide.back": "返回",
    "guide.searchPlaceholder": "搜索建筑、设施、便利店...",
    "guide.popular.title": "热门地点",
    "guide.popular.description": "学生经常使用的目的地。",
    "guide.purpose.study": "学习",
    "guide.purpose.rest": "休息",
    "guide.purpose.convenience": "便利设施",
    "guide.purpose.convenience_store": "便利店",
    "guide.purpose.cafe": "咖啡厅",
    "guide.purpose.food": "食堂",
    "guide.purpose.parking": "停车场",
    "guide.direct": "立即导航",
    "guide.details": "设施与地点信息",
    "guide.noPurposeResults": "未找到符合条件的设施信息。",
    "guide.distanceApprox": "约",
    "guide.minutes": "分钟",
    "guide.mode.walk": "步行",
    "guide.mode.bike": "自行车",
    "guide.mode.car": "驾车",
    "guide.modeLabel.walk": "步行",
    "guide.modeLabel.bike": "骑车",
    "guide.modeLabel.car": "驾车",
    "guide.destination": "目的地",
    "guide.placeTips": "地点提示",
    "guide.transport.title": "您想如何前往？",
    "guide.start.walk": "开始步行导航",
    "guide.start.bike": "开始骑行导航",
    "guide.start.car": "开始驾车导航",
    "guide.routeError": "无法加载{mode}路线。",
    "guide.gpsUnavailable": "无法使用GPS，将使用最后位置导航。",
    "guide.gpsPermission": "允许GPS权限即可使用实时重新规划。",
    "guide.remaining": "剩余{distance}",
    "guide.routeLoading": "正在查找{mode}路线",
    "guide.routeFollow": "请沿路线前进",
    "guide.arrived": "已到达目的地",
    "guide.ahead": "前方{distance}",
    "guide.wait": "请稍候",
    "guide.gpsChecking": "正在确认GPS位置",
    "guide.destinationSummary": "到{destination}{mode}{minutes}分钟",
    "guide.arrival": "{time}到达",
    "guide.changeDestination": "更改目的地",
    "guide.end": "结束导航",
    "audio.start": "开始语音导航",
    "audio.textMode": "文字导航",
    "audio.unstable": "连接不稳定",
    "summary.title": "导览总结",
    "summary.visited": "今天到访的地点",
    "summary.tips": "重点提示",
    "summary.narrations": "今日讲解内容",
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
  pn: (value: string) => string;
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
  const router = useRouter();

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    // 쿠키에도 저장해서 서버 컴포넌트(tour/page.tsx)에서 읽을 수 있게 함
    document.cookie = `campus-tour-locale=${nextLocale}; path=/; SameSite=Lax; max-age=31536000`;
    // 서버 컴포넌트에서 새 언어로 데이터를 다시 불러오도록 페이지 새로고침
    router.refresh();
  }, [router]);

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

  const pn = useCallback(
    (value: string) => translateProperNoun(locale, value),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, volume, isMuted: volume === 0, toggleMute, t, pn }),
    [locale, setLocale, toggleMute, t, pn, volume],
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

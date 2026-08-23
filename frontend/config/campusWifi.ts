import type { AppLocale } from "@/contexts/AppSettingsContext";

export type CampusWifiConfig = {
  enabled: boolean;
  ssid: string;
  title: Record<AppLocale, string>;
  steps: Record<AppLocale, string[]>;
  helpUrl?: string;
  updatedAt: string;
};

// Enable only after the university's guest SSID, steps, and official URL are verified.
export const campusWifi: CampusWifiConfig = {
  enabled: false,
  ssid: "",
  title: {
    ko: "교내 Wi-Fi 연결 안내",
    en: "Campus Wi-Fi guide",
    ja: "学内Wi-Fi接続案内",
    zh: "校园 Wi-Fi 连接指南",
  },
  steps: { ko: [], en: [], ja: [], zh: [] },
  updatedAt: "2026-08-23",
};


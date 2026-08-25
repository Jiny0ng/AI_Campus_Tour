import type { AppLocale } from "@/contexts/AppSettingsContext";
import en from "@/locales/properNouns/en.json";
import ja from "@/locales/properNouns/ja.json";
import zh from "@/locales/properNouns/zh.json";

type ProperNounDictionary = Record<string, string>;

const dictionaries: Record<Exclude<AppLocale, "ko">, ProperNounDictionary> = {
  en,
  ja,
  zh,
};

/**
 * Translate a canonical Korean campus name for display only.
 * IDs, routing payloads, and Neo4j queries must keep the canonical Korean value.
 */
export function translateProperNoun(locale: AppLocale, value: string) {
  if (locale === "ko" || !value) return value;
  return dictionaries[locale][value] ?? value;
}

export function hasProperNounTranslation(locale: AppLocale, value: string) {
  return locale === "ko" || value in dictionaries[locale];
}

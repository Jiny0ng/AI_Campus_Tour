import { cookies } from "next/headers";
import { CampusTourScreen } from "@/components/Tour";
import { apiClient } from "@/lib/apiClient";
import type { AppLocale } from "@/contexts/AppSettingsContext";
import type { CampusTourData } from "@/types";

export const dynamic = "force-dynamic";

const VALID_LOCALES = new Set<AppLocale>(["ko", "en", "ja", "zh"]);

export default async function TourPage() {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("campus-tour-locale")?.value ?? "ko";
  const language: AppLocale = VALID_LOCALES.has(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : "ko";

  const response = await apiClient.post<{ data: CampusTourData }>(
    "/tour/init",
    { language },
    { timeout: 60000 },
  );

  return <CampusTourScreen data={response.data.data} />;
}

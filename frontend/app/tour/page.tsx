import { CampusTourScreen } from "@/components/Tour";
import { apiClient } from "@/lib/apiClient";
import type { CampusTourData } from "@/types";

export const dynamic = "force-dynamic";

export default async function TourPage() {
  const response = await apiClient.post<{ data: CampusTourData }>(
    "/tour/init",
    { language: "ko" },
    { timeout: 60000 },
  );

  return <CampusTourScreen data={response.data.data} />;
}

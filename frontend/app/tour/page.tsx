import { CampusTourScreen } from "@/components/Tour";
import { apiClient } from "@/lib/apiClient";
import type { CampusTourData } from "@/types";

type TourPageProps = {
  searchParams: Promise<{ theme?: string }>;
};

export default async function TourPage({ searchParams }: TourPageProps) {
  const params = await searchParams;
  const theme = params.theme ?? "공과대학";
  const response = await apiClient.post<{ data: CampusTourData }>("/tour/init", {
    start_location: "건지광장",
    theme,
  });

  return <CampusTourScreen data={response.data.data} />;
}

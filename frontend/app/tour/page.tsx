import { CampusTourScreen } from "@/components/Tour";

export default function TourPage() {
  const emptyTourData = {
    id: "",
    title: "",
    description: "",
    durationMinutes: 0,
    totalDistanceMeters: 0,
    stops: [],
    routeSegments: [],
  };

  return <CampusTourScreen data={emptyTourData} />;
}

import { Suspense } from "react";
import { NavigationScreen } from "@/components/Guide";
import { campusGuideData } from "@/dummy";

export default function NavigationPage() {
  return (
    <Suspense fallback={null}>
      <NavigationScreen data={campusGuideData} />
    </Suspense>
  );
}

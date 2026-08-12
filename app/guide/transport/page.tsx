import { Suspense } from "react";
import { TransportModeScreen } from "@/components/Guide";
import { campusGuideData } from "@/dummy";

export default function TransportModePage() {
  return (
    <Suspense fallback={null}>
      <TransportModeScreen data={campusGuideData} />
    </Suspense>
  );
}

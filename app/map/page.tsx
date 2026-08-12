import { MobileShell } from "@/components/Layout";
import { CampusMap } from "@/components/Map";
import { campusCenter } from "@/constants/campus";

export default function MapPage() {
  return (
    <MobileShell>
      <CampusMap center={campusCenter} zoom={16} />
    </MobileShell>
  );
}

import { TourSetupForm } from "@/components/Tour";
import { MobileShell } from "@/components/Layout";
import { collegeOptions, languageOptions } from "@/dummy";

export default function TourSetupPage() {
  return (
    <MobileShell className="bg-surface">
      <TourSetupForm colleges={collegeOptions} languages={languageOptions} />
    </MobileShell>
  );
}

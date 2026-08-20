import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/constants/routes";

export default function TourSetupPage() {
  redirect(APP_ROUTES.tour);
}

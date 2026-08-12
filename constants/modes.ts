import {
  Bus,
  CarFront,
  MapPinned,
  MessageCircle,
  Route,
  Search,
} from "lucide-react";
import type { GuideMenuItem } from "@/types";
import { APP_ROUTES } from "./routes";

export const GUIDE_MENU_ITEMS: GuideMenuItem[] = [
  {
    label: "Building Search",
    href: APP_ROUTES.buildingSearch,
    icon: Search,
  },
  {
    label: "Navigation",
    href: APP_ROUTES.navigation,
    icon: Route,
  },
  {
    label: "Facilities",
    href: APP_ROUTES.facilities,
    icon: MapPinned,
  },
  {
    label: "Parking",
    href: APP_ROUTES.parking,
    icon: CarFront,
  },
  {
    label: "Shuttle Bus",
    href: APP_ROUTES.transport,
    icon: Bus,
  },
  {
    label: "AI Q&A",
    href: APP_ROUTES.aiChat,
    icon: MessageCircle,
  },
];

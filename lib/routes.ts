import { APP_ROUTES } from "@/constants/routes";

export function isAppRoute(value: string) {
  return Object.values(APP_ROUTES).includes(value as (typeof APP_ROUTES)[keyof typeof APP_ROUTES]);
}

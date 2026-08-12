"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, MessageCircle, Route, Search } from "lucide-react";
import { APP_ROUTES } from "@/constants/routes";
import { cn } from "@/lib/cn";

const items = [
  { href: APP_ROUTES.guide, label: "Guide", icon: Search },
  { href: APP_ROUTES.map, label: "Map", icon: Map },
  { href: APP_ROUTES.tour, label: "Tour", icon: Route },
  { href: APP_ROUTES.aiChat, label: "AI", icon: MessageCircle },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition",
              active ? "text-primary" : "text-muted",
            )}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

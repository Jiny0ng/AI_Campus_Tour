import Link from "next/link";
import type { GuideMenuItem } from "@/types";

type GuideMenuGridProps = {
  items: GuideMenuItem[];
};

export function GuideMenuGrid({ items }: GuideMenuGridProps) {
  return (
    <section className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-28 flex-col justify-between rounded-lg border border-line bg-surface p-4"
          >
            <Icon size={24} className="text-primary" />
            <span className="text-sm font-semibold text-ink">{item.label}</span>
          </Link>
        );
      })}
    </section>
  );
}

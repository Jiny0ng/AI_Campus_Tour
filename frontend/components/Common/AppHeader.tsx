import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { APP_ROUTES } from "@/constants/routes";

type AppHeaderProps = {
  title: string;
  showBack?: boolean;
};

export function AppHeader({ title, showBack = false }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      {showBack ? (
        <Link
          href={APP_ROUTES.home}
          className="grid size-9 place-items-center rounded-full text-ink"
          aria-label="Go back"
        >
          <ChevronLeft size={22} />
        </Link>
      ) : null}
      <h1 className="truncate text-base font-semibold text-ink">{title}</h1>
    </header>
  );
}

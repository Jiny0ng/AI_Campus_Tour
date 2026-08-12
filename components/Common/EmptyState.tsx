import { ReactNode } from "react";
import { SearchX } from "lucide-react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        {icon ?? <SearchX size={24} />}
      </div>
      <h2 className="mt-4 text-base font-bold text-ink">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-5 text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

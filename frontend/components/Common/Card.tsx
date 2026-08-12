"use client";

import { HTMLAttributes, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        interactive && "transition active:scale-[0.99]",
        className,
      )}
      {...props}
    />
  );
}

type InfoCardProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function InfoCard({
  icon,
  title,
  description,
  trailing,
  onClick,
  className,
}: InfoCardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      className={cn(
        "flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card",
        isInteractive && "transition active:scale-[0.99]",
        !isInteractive && "cursor-default",
        className,
      )}
    >
      {icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{title}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-muted">{description}</span>
        ) : null}
      </span>
      {trailing ?? (isInteractive ? <ChevronRight size={18} className="text-muted" /> : null)}
    </button>
  );
}

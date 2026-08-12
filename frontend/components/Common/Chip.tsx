"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ChipVariant = "default" | "active" | "outline" | "soft";
type ChipSize = "sm" | "md";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  variant?: ChipVariant;
  size?: ChipSize;
  icon?: ReactNode;
};

const variantClassName: Record<ChipVariant, string> = {
  default: "border-line bg-surface text-ink shadow-card",
  active: "border-primary bg-primary-soft text-primary",
  outline: "border-primary bg-surface text-primary",
  soft: "border-transparent bg-primary-soft text-primary",
};

const sizeClassName: Record<ChipSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

export function Chip({
  className,
  selected = false,
  variant = "default",
  size = "md",
  icon,
  children,
  ...props
}: ChipProps) {
  const resolvedVariant = selected ? "active" : variant;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-semibold transition active:scale-[0.98]",
        variantClassName[resolvedVariant],
        sizeClassName[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

type ChipGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ChipGroup({ children, className }: ChipGroupProps) {
  return (
    <div
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

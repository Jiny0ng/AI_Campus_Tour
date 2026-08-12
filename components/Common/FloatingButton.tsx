"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type FloatingButtonVariant = "surface" | "primary" | "soft";
type FloatingButtonSize = "md" | "lg";

type FloatingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  variant?: FloatingButtonVariant;
  size?: FloatingButtonSize;
  label?: string;
};

const variantClassName: Record<FloatingButtonVariant, string> = {
  surface: "bg-surface text-ink",
  primary: "bg-primary text-white",
  soft: "bg-primary-soft text-primary",
};

const sizeClassName: Record<FloatingButtonSize, string> = {
  md: "size-11",
  lg: "size-12",
};

export function FloatingButton({
  className,
  icon,
  variant = "surface",
  size = "md",
  label,
  "aria-label": ariaLabel,
  ...props
}: FloatingButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      className={cn(
        "grid shrink-0 place-items-center rounded-full shadow-floating transition active:scale-95",
        variantClassName[variant],
        sizeClassName[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

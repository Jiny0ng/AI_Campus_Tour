"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-button hover:bg-primary-dark",
  secondary: "bg-primary-soft text-primary hover:bg-primary-pale",
  outline: "border border-primary bg-surface text-primary hover:bg-primary-soft",
  ghost: "bg-transparent text-ink hover:bg-page",
  danger: "bg-red-500 text-white hover:bg-red-600",
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: "h-9 rounded-button px-3 text-sm",
  md: "h-11 rounded-button px-4 text-sm",
  lg: "h-[52px] rounded-button px-5 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variantClassName[variant],
        sizeClassName[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : leftIcon}
      {children}
      {!loading ? rightIcon : null}
    </button>
  );
}

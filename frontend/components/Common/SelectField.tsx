"use client";

import { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function SelectField({ label, className, children, ...props }: SelectFieldProps) {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-sm font-bold text-ink">{label}</span> : null}
      <span className="relative block">
        <select
          className={cn(
            "h-[46px] w-full appearance-none rounded-input border border-line bg-surface px-4 pr-10 text-sm font-semibold text-ink shadow-card outline-none focus:border-primary",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={18}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
        />
      </span>
    </label>
  );
}

"use client";

import { InputHTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

type SearchBarProps = InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  containerClassName?: string;
};

export function SearchBar({
  className,
  containerClassName,
  leftIcon,
  rightSlot,
  ...props
}: SearchBarProps) {
  return (
    <label
      className={cn(
        "flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 shadow-card",
        containerClassName,
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center text-muted">
        {leftIcon ?? <Search size={18} />}
      </span>
      <input
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted",
          className,
        )}
        {...props}
      />
      {rightSlot}
    </label>
  );
}

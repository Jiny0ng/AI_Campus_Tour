"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type DropdownOption = {
  label: string;
  value: string;
};

type DropdownSelectProps = {
  label: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
};

export function DropdownSelect({
  label,
  value,
  options,
  placeholder = "선택해주세요",
  onChange,
  className,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <span className="mb-2 block text-sm font-bold text-ink">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-[46px] w-full items-center justify-between gap-3 rounded-input border bg-surface px-4 text-left text-sm font-semibold shadow-card outline-none transition",
          open ? "border-primary" : "border-line",
        )}
        aria-expanded={open}
      >
        <span className={cn("truncate", selectedOption ? "text-ink" : "text-muted")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-muted transition", open && "rotate-180 text-primary")}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-60 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-floating">
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-11 w-full items-center px-4 text-left text-sm font-semibold transition",
                  selected ? "bg-primary-soft text-primary" : "text-ink hover:bg-page",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

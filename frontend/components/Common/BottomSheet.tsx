"use client";

import { PropsWithChildren, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type BottomSheetProps = PropsWithChildren<{
  open?: boolean;
  title?: string;
  description?: string;
  footer?: ReactNode;
  onClose?: () => void;
  showHandle?: boolean;
  className?: string;
  contentClassName?: string;
}>;

export function BottomSheet({
  open = true,
  title,
  description,
  footer,
  onClose,
  showHandle = true,
  className,
  contentClassName,
  children,
}: BottomSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <section
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] rounded-t-sheet bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 shadow-sheet",
        className,
      )}
    >
      {showHandle ? <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-handle" /> : null}
      {title || description || onClose ? (
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-lg font-bold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-5 text-muted">{description}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
              aria-label="Close bottom sheet"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={contentClassName}>{children}</div>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </section>
  );
}

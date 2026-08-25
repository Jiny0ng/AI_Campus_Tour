"use client";

import { PropsWithChildren, ReactNode, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence, useDragControls, useMotionValue } from "framer-motion";
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
  freeDrag?: boolean;
  minVisibleHeightVh?: number;
  maxHeightVh?: number;
  initialHeightVh?: number;
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
  freeDrag = false,
  minVisibleHeightVh = 18,
  maxHeightVh = 60,
  initialHeightVh = 26,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const initializedFreeDragRef = useRef(false);
  const [maxDragY, setMaxDragY] = useState(0);
  const dragControls = useDragControls();
  const dragY = useMotionValue(0);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const updateMaxDrag = () => {
      if (freeDrag) {
        const viewportHeight = window.innerHeight;
        const nextMax = viewportHeight * (maxHeightVh - minVisibleHeightVh) / 100;
        setMaxDragY(Math.max(0, nextMax));
        const initialOffset = viewportHeight * (maxHeightVh - initialHeightVh) / 100;
        if (!initializedFreeDragRef.current) {
          dragY.set(Math.max(0, Math.min(nextMax, initialOffset)));
          initializedFreeDragRef.current = true;
        } else if (dragY.get() > nextMax) {
          dragY.set(nextMax);
        }
      } else {
        const handleVisibleHeight = 44;
        setMaxDragY(Math.max(0, sheet.getBoundingClientRect().height - handleVisibleHeight));
      }
    };

    updateMaxDrag();
    const observer = new ResizeObserver(updateMaxDrag);
    observer.observe(sheet);

    return () => observer.disconnect();
  }, [dragY, freeDrag, initialHeightVh, maxHeightVh, minVisibleHeightVh, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={sheetRef}
          initial={false}
          animate={freeDrag ? undefined : { y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          drag="y"
          dragControls={dragControls}
          dragListener={!freeDrag}
          dragConstraints={{ top: 0, bottom: maxDragY }}
          dragElastic={0}
          dragMomentum={false}
          style={freeDrag ? { height: `${maxHeightVh}dvh`, y: dragY } : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 mx-auto flex max-h-[90dvh] w-full max-w-[430px] flex-col rounded-t-sheet bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 shadow-sheet",
            className,
          )}
        >
          {showHandle ? (
            <div
              className="mx-auto mb-4 h-1 w-10 shrink-0 cursor-grab touch-none rounded-full bg-handle active:cursor-grabbing"
              onPointerDown={(event) => freeDrag && dragControls.start(event)}
            />
          ) : null}
          {title || description || onClose ? (
            <div className="mb-4 flex shrink-0 items-start gap-3">
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
          <div className={cn("overflow-y-auto", contentClassName)}>{children}</div>
          {footer ? <div className="mt-5 shrink-0">{footer}</div> : null}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

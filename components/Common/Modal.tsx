"use client";

import { PropsWithChildren, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

type ModalProps = PropsWithChildren<{
  open: boolean;
  title?: string;
  description?: string;
  footer?: ReactNode;
  onClose?: () => void;
  className?: string;
}>;

export function Modal({
  open,
  title,
  description,
  footer,
  onClose,
  className,
  children,
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("w-full max-w-[342px] rounded-2xl bg-surface p-5 shadow-floating", className)}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-lg font-bold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </section>
    </div>
  );
}

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button onClick={onConfirm}>{confirmText}</Button>
        </div>
      }
    >
      <div />
    </Modal>
  );
}

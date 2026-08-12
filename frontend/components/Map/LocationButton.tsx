"use client";

import { LocateFixed } from "lucide-react";

type LocationButtonProps = {
  onClick?: () => void;
};

export function LocationButton({ onClick }: LocationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full bg-surface text-primary shadow-sm"
      aria-label="Use current location"
    >
      <LocateFixed size={20} />
    </button>
  );
}

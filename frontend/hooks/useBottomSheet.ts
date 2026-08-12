import { useState } from "react";

export function useBottomSheet(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);

  return {
    open,
    close: () => setOpen(false),
    openSheet: () => setOpen(true),
    toggle: () => setOpen((value) => !value),
  };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Languages, Settings, Volume2, VolumeX, X } from "lucide-react";
import { localeOptions, useAppSettings } from "@/contexts/AppSettingsContext";

export function TourSettingsMenu() {
  const { locale, setLocale, isMuted, toggleMute, t } = useAppSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setShowLanguages(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setShowLanguages(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function toggleSettings() {
    setIsOpen((open) => {
      if (open) setShowLanguages(false);
      return !open;
    });
  }

  return (
    <div ref={containerRef} className="flex flex-col items-end">
      <button
        type="button"
        aria-label={isOpen ? t("settings.close") : t("settings.open")}
        aria-expanded={isOpen}
        className="grid size-[38px] place-items-center rounded-full bg-surface/95 text-ink shadow-card backdrop-blur-sm"
        onClick={toggleSettings}
      >
        {isOpen ? <X size={20} /> : <Settings size={20} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="mt-2 w-44 overflow-hidden rounded-2xl border border-line bg-surface/95 p-2 shadow-sheet backdrop-blur-md"
          >
            <button
              type="button"
              aria-pressed={isMuted}
              className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-ink hover:bg-primary-soft"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span>{isMuted ? t("settings.soundOn") : t("settings.sound")}</span>
            </button>
            <button
              type="button"
              aria-expanded={showLanguages}
              className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-ink hover:bg-primary-soft"
              onClick={() => setShowLanguages((shown) => !shown)}
            >
              <Languages size={18} />
              <span className="flex-1">{t("settings.language")}</span>
              <span className="text-xs text-muted">
                {localeOptions.find((option) => option.value === locale)?.label}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {showLanguages && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 border-t border-line pt-1">
                    {localeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="flex h-9 w-full items-center rounded-lg px-3 text-sm font-semibold text-ink hover:bg-primary-soft"
                        onClick={() => setLocale(option.value)}
                      >
                        <span className="flex-1 text-left">{option.label}</span>
                        {locale === option.value && <Check size={16} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

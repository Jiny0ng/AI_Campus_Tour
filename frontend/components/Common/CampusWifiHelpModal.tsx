"use client";

import { Copy, ExternalLink } from "lucide-react";
import { Modal } from "@/components/Common/Modal";
import { campusWifi } from "@/config/campusWifi";
import { useAppSettings } from "@/contexts/AppSettingsContext";

type Props = {
  open: boolean;
  onClose: () => void;
  onDismissPermanently: () => void;
};

export function CampusWifiHelpModal({ open, onClose, onDismissPermanently }: Props) {
  const { locale } = useAppSettings();
  return (
    <Modal open={open} title={campusWifi.title[locale]} onClose={onClose}>
      <div className="rounded-xl bg-primary-soft p-3">
        <p className="text-xs font-bold text-muted">SSID</p>
        <div className="mt-1 flex items-center gap-2">
          <strong className="min-w-0 flex-1 truncate text-ink">{campusWifi.ssid}</strong>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full bg-surface text-primary"
            aria-label="SSID 복사"
            onClick={() => void navigator.clipboard?.writeText(campusWifi.ssid)}
          >
            <Copy size={15} />
          </button>
        </div>
      </div>
      <ol className="mt-4 space-y-2 text-sm leading-6 text-ink">
        {campusWifi.steps[locale].map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="font-extrabold text-primary">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {campusWifi.helpUrl ? (
        <a
          href={campusWifi.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center gap-1 text-sm font-bold text-primary"
        >
          학교 공식 안내 보기 <ExternalLink size={14} />
        </a>
      ) : null}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="h-11 rounded-xl border border-line text-sm font-bold" onClick={onDismissPermanently}>
          다시 보지 않기
        </button>
        <button type="button" className="h-11 rounded-xl bg-primary text-sm font-bold text-white" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  );
}


"use client";

import { Send } from "lucide-react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatInput({ value, onChange, onSubmit }: ChatInputProps) {
  return (
    <form
      className="flex gap-2 border-t border-line bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask about the campus"
        className="h-11 min-w-0 flex-1 rounded-lg bg-page px-4 text-sm outline-none"
      />
      <button
        type="submit"
        className="grid size-11 place-items-center rounded-lg bg-primary text-white"
        aria-label="Send message"
      >
        <Send size={18} />
      </button>
    </form>
  );
}

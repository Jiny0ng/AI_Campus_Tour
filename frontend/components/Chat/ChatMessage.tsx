import type { ChatMessage as ChatMessageType } from "@/types";
import { cn } from "@/lib/cn";

type ChatMessageProps = {
  message: ChatMessageType;
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[82%] rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-white" : "bg-surface text-ink",
        )}
      >
        {message.content}
      </p>
    </div>
  );
}

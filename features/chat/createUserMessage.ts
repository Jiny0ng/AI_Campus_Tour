import type { ChatMessage } from "@/types";

export function createUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

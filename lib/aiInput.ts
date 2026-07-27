import { z } from "zod";
import type { ChatMessage } from "./ai";
import { RequestError } from "./security";

const ChatMessagesSchema = z
  .array(
    z
      .object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4_000),
      })
      .strict()
  )
  .min(1)
  .max(12)
  .refine((messages) => messages.at(-1)?.role === "user", {
    message: "The final chat message must be from the user.",
  });

export function parseChatMessages(value: unknown): ChatMessage[] {
  const result = ChatMessagesSchema.safeParse(value);
  if (!result.success) {
    throw new RequestError(
      result.error.issues[0]?.message || "Invalid chat messages.",
      400
    );
  }
  return result.data;
}

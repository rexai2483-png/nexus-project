import { prisma } from "../db/client";
import { createAiProvider } from "../ai/providerFactory";
import { runConversationTurn } from "../ai/conversationEngine";
import { toAiError } from "../ai/errors";
import { createTaskFromPlan } from "./taskService";
import { recordSystemEvent } from "./activityService";
import type { AiMessage, AiProvider } from "../ai/types";
import type {
  Conversation,
  ConversationDetail,
  Message,
  MessageIntent,
  MessageRole,
  SendMessageResult,
  Task,
} from "../../shared/types/models";

// Must match the Conversation.title `@default(...)` in prisma/schema.prisma.
const DEFAULT_CONVERSATION_TITLE = "New conversation";
const MAX_HISTORY_MESSAGES = 30;
const TITLE_PREVIEW_LENGTH = 60;

function toConversationDto(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageDto(row: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  intent: string | null;
  taskId: string | null;
  createdAt: Date;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    intent: row.intent as MessageIntent | null,
    taskId: row.taskId,
    createdAt: row.createdAt.toISOString(),
  };
}

function deriveTitleFromContent(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= TITLE_PREVIEW_LENGTH) return singleLine;
  return `${singleLine.slice(0, TITLE_PREVIEW_LENGTH).trimEnd()}…`;
}

/** Lists conversations, most recently active first. */
export async function listConversations(): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return rows.map(toConversationDto);
}

export async function createConversation(input?: { title?: string }): Promise<Conversation> {
  const title = input?.title?.trim();
  const row = await prisma.conversation.create({
    data: title ? { title } : {},
  });
  await recordSystemEvent({ type: "INFO", source: "AGENT", message: "Started a new conversation." });
  return toConversationDto(row);
}

/** Loads a conversation with its full message history, or null if it doesn't exist. */
export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) return null;
  return { ...toConversationDto(row), messages: row.messages.map(toMessageDto) };
}

/**
 * The core conversation turn: persist the user's message, ask the AI to
 * classify and respond, persist the reply (and a Task/TaskSteps when the
 * AI proposed one), and return everything new.
 *
 * This always resolves — it never throws for an AI-side failure. If the
 * AI is unreachable, misconfigured, or returns something invalid, the
 * user's message is still saved and `error` describes what went wrong,
 * so the conversation never silently loses what the user typed.
 */
export async function sendMessage(
  input: { conversationId: string; content: string },
  /**
   * Test-only seam: lets tests substitute a fake AiProvider instead of
   * constructing the real configured one. Never used by production code
   * — electron/ipc/handlers.ts always calls this with one argument.
   */
  deps?: { provider?: AiProvider },
): Promise<SendMessageResult> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("Message content cannot be empty.");
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  const priorMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
  });
  priorMessages.reverse();

  const userRow = await prisma.message.create({
    data: { conversationId: conversation.id, role: "USER", content },
  });
  const userMessage = toMessageDto(userRow);

  if (priorMessages.length === 0 && conversation.title === DEFAULT_CONVERSATION_TITLE) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title: deriveTitleFromContent(content) },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  }

  let provider: AiProvider;
  try {
    provider = deps?.provider ?? createAiProvider();
  } catch (err) {
    const aiError = toAiError(err);
    await recordSystemEvent({
      type: "WARNING",
      source: "AGENT",
      message: `AI request skipped: ${aiError.message}`,
    });
    return { userMessage, assistantMessage: null, task: null, error: aiError.toInfo() };
  }

  const history: AiMessage[] = [...priorMessages, userRow]
    .filter((message) => message.role === "USER" || message.role === "ASSISTANT")
    .map((message) => ({
      role: message.role === "ASSISTANT" ? "assistant" : "user",
      content: message.content,
    }));

  let structured;
  try {
    structured = await runConversationTurn(provider, history);
  } catch (err) {
    const aiError = toAiError(err);
    await recordSystemEvent({
      type: "ERROR",
      source: "AGENT",
      message: `AI request failed: ${aiError.message}`,
    });
    return { userMessage, assistantMessage: null, task: null, error: aiError.toInfo() };
  }

  let task: Task | null = null;
  if (structured.plan && (structured.intent === "TASK" || structured.intent === "SENSITIVE")) {
    task = await createTaskFromPlan({
      conversationId: conversation.id,
      instruction: content,
      sensitive: structured.intent === "SENSITIVE",
      plan: structured.plan,
    });
  }

  const assistantRow = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: structured.reply,
      intent: structured.intent,
      taskId: task?.id ?? null,
    },
  });

  await recordSystemEvent({
    type: structured.intent === "SENSITIVE" ? "WARNING" : "INFO",
    source: "AGENT",
    message: task
      ? `Proposed ${structured.intent === "SENSITIVE" ? "a sensitive task" : "a task"}: "${task.title}".`
      : `Replied to a ${structured.intent.toLowerCase()} message.`,
  });

  return { userMessage, assistantMessage: toMessageDto(assistantRow), task, error: null };
}

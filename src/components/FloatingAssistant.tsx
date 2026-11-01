import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChatMessage } from "./ChatMessage";
import type { AiStatus, Conversation, Message, Task } from "@shared/types/models";

interface FloatingAssistantProps {
  /** Lets the panel hand off to the Tasks page when a proposed task is opened. */
  onViewTask: (taskId: string) => void;
}

/**
 * The conversation surface for NEXUS. Minimal and unobtrusive when
 * closed (see the launcher button at the bottom), a real chat panel
 * when open: persistent conversations, context-aware replies, explicit
 * loading/error states, and a clear visual distinction between a plain
 * reply and a proposed task. Nothing in here claims a task has run.
 */
export function FloatingAssistant({ onViewTask }: FloatingAssistantProps) {
  const [open, setOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<Record<string, Task>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function selectConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setShowHistory(false);
    setLoadError(null);
    try {
      const detail = await window.nexus.conversations.get({ conversationId });
      setMessages(detail.messages);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load that conversation.");
    }
  }

  // Lazily load status + history the first time the panel is opened.
  useEffect(() => {
    if (!open || initialized) return;
    setInitialized(true);
    setLoadError(null);

    Promise.all([window.nexus.ai.getStatus(), window.nexus.conversations.list()])
      .then(async ([status, convos]) => {
        setAiStatus(status);
        setConversations(convos);
        if (convos.length > 0) {
          await selectConversation(convos[0].id);
        }
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load the assistant.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Backfill full Task objects for any proposed-task bubbles we don't have yet
  // (e.g. after reopening a past conversation).
  useEffect(() => {
    const hasMissing = messages.some((message) => message.taskId && !taskSummaries[message.taskId]);
    if (!hasMissing) return;
    window.nexus.tasks
      .list()
      .then((tasks) => {
        setTaskSummaries((prev) => {
          const next = { ...prev };
          for (const task of tasks) next[task.id] = task;
          return next;
        });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function startNewConversation() {
    setShowHistory(false);
    setLoadError(null);
    try {
      const created = await window.nexus.conversations.create();
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
      setSendError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to start a new conversation.");
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setSendError(null);

    const tempId = `pending-${messages.length}-${content.length}-${Math.floor(performance.now())}`;

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const created = await window.nexus.conversations.create();
        conversationId = created.id;
        setActiveConversationId(created.id);
        setConversations((prev) => [created, ...prev]);
      }
      // Narrow once into a const so it stays typed as `string` (not
      // `string | null`) inside the closures below.
      const resolvedConversationId: string = conversationId;

      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          conversationId: resolvedConversationId,
          role: "USER",
          content,
          intent: null,
          taskId: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");

      const result = await window.nexus.messages.send({
        conversationId: resolvedConversationId,
        content,
      });

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((message) => message.id !== tempId);
        const next = [...withoutOptimistic, result.userMessage];
        if (result.assistantMessage) next.push(result.assistantMessage);
        return next;
      });

      if (result.task) {
        const createdTask = result.task;
        setTaskSummaries((prev) => ({ ...prev, [createdTask.id]: createdTask }));
      }
      if (result.error) {
        setSendError(result.error.message);
      }

      window.nexus.conversations
        .list()
        .then(setConversations)
        .catch(() => undefined);
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setSendError(err instanceof Error ? err.message : "Failed to send that message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="pointer-events-auto flex h-[560px] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-nexus-border bg-nexus-surface-raised shadow-xl shadow-black/30">
          <div className="flex items-center justify-between gap-2 border-b border-nexus-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-nexus-text">
                {activeConversation?.title ?? "Assistant"}
              </p>
              <p className="text-[11px] text-nexus-text-faint">
                {aiStatus
                  ? aiStatus.configured
                    ? `${aiStatus.provider} · ${aiStatus.model}`
                    : "AI not configured"
                  : "NEXUS"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                aria-label="Conversation history"
                className="rounded px-2 py-1 text-xs text-nexus-text-muted transition-colors hover:bg-nexus-surface hover:text-nexus-text"
              >
                History
              </button>
              <button
                type="button"
                onClick={() => void startNewConversation()}
                aria-label="New conversation"
                className="rounded px-2 py-1 text-xs text-nexus-text-muted transition-colors hover:bg-nexus-surface hover:text-nexus-text"
              >
                New
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded px-2 py-1 text-sm text-nexus-text-muted transition-colors hover:bg-nexus-surface hover:text-nexus-text"
              >
                ×
              </button>
            </div>
          </div>

          {showHistory ? (
            <div className="max-h-40 overflow-y-auto border-b border-nexus-border">
              {conversations.length === 0 ? (
                <p className="px-4 py-3 text-xs text-nexus-text-faint">No conversations yet.</p>
              ) : (
                <ul>
                  {conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => void selectConversation(conversation.id)}
                        className={[
                          "block w-full truncate px-4 py-2 text-left text-xs transition-colors",
                          conversation.id === activeConversationId
                            ? "bg-nexus-accent-muted text-nexus-text"
                            : "text-nexus-text-muted hover:bg-nexus-surface hover:text-nexus-text",
                        ].join(" ")}
                      >
                        {conversation.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {aiStatus && !aiStatus.configured ? (
            <div className="border-b border-nexus-border bg-nexus-warning/10 px-4 py-2 text-[11px] text-nexus-warning">
              No AI provider is configured. Set ANTHROPIC_API_KEY in your .env file to enable replies.
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {loadError ? (
              <p className="text-xs text-nexus-danger">{loadError}</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-nexus-text-faint">
                Ask a question, or describe something you&apos;d like NEXUS to plan.
              </p>
            ) : (
              messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  task={message.taskId ? taskSummaries[message.taskId] : undefined}
                  onViewTask={(taskId) => {
                    setOpen(false);
                    onViewTask(taskId);
                  }}
                />
              ))
            )}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-lg bg-nexus-surface px-3 py-2 text-xs text-nexus-text-faint">
                  NEXUS is thinking…
                </div>
              </div>
            ) : null}
            {sendError ? (
              <div className="rounded-md border border-nexus-danger/40 bg-nexus-danger/10 px-3 py-2 text-xs text-nexus-danger">
                {sendError}
              </div>
            ) : null}
          </div>

          <div className="border-t border-nexus-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message NEXUS…"
                rows={2}
                disabled={sending}
                className="flex-1 resize-none rounded-md border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-nexus-text placeholder:text-nexus-text-faint focus:border-nexus-accent focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || !draft.trim()}
                className="shrink-0 rounded-md bg-nexus-accent px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="NEXUS assistant"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-nexus-border bg-nexus-surface-raised text-nexus-text-muted shadow-md shadow-black/30 transition-colors hover:text-nexus-accent"
      >
        <span className="text-sm font-semibold">N</span>
      </button>
    </div>
  );
}

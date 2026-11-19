import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChatMessage } from "./ChatMessage";
import { EmergencyStopButton } from "./EmergencyStopButton";
import { ScreenObservationPanel } from "./ScreenObservationPanel";
import { isPreviewModeActive } from "../lib/nexusBridge";
import type { AiStatus, Conversation, Message, Task, TaskDetail } from "@shared/types/models";

interface FloatingAssistantProps {
  /** Lets the panel hand off to the Tasks page when a proposed task is opened. */
  onViewTask: (taskId: string) => void;
  /** Lets the panel hand off to the Screen workspace page. */
  onViewScreen: () => void;
}

const POSITION_STORAGE_KEY = "nexus.assistant.position";
const DEFAULT_POSITION = { right: 24, bottom: 24 };
const TASK_POLL_INTERVAL_MS = 4000;

interface Position {
  right: number;
  bottom: number;
}

function loadStoredPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
      return { right: parsed.right, bottom: parsed.bottom };
    }
  } catch {
    // Corrupt/unavailable storage — fall back to the default corner.
  }
  return DEFAULT_POSITION;
}

/**
 * Minimal drag-to-reposition behavior for the whole widget (icon, working
 * pill, or expanded panel — whichever is currently rendered). Position is
 * stored as distance from the bottom-right corner so it stays pinned to
 * the same corner across window resizes, and persisted locally so the
 * assistant reopens where the user left it.
 */
function useDraggablePosition() {
  const [position, setPosition] = useState<Position>(() => loadStoredPosition());
  const dragState = useRef<{ startX: number; startY: number; origin: Position } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Only the primary button/touch starts a drag; avoid hijacking
      // interactions with buttons/inputs inside the handle.
      if (event.button !== 0) return;
      dragState.current = { startX: event.clientX, startY: event.clientY, origin: position };
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    },
    [position],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragState.current) return;
    const { startX, startY, origin } = dragState.current;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) > 3) setDragging(true);

    const next: Position = {
      right: Math.max(8, Math.min(window.innerWidth - 60, origin.right - dx)),
      bottom: Math.max(8, Math.min(window.innerHeight - 40, origin.bottom - dy)),
    };
    setPosition(next);
  }, [dragging]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!dragState.current) return;
      dragState.current = null;
      (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
      setPosition((current) => {
        try {
          localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(current));
        } catch {
          // Best effort only.
        }
        return current;
      });
      // Defer clearing `dragging` so the click handler that fires right
      // after pointerup can check it and suppress an accidental toggle.
      setTimeout(() => setDragging(false), 0);
    },
    [],
  );

  return { position, dragging, dragHandleProps: { onPointerDown, onPointerMove, onPointerUp } };
}

/**
 * The conversation surface for NEXUS. Three states: a compact floating
 * icon when idle, a "working" pill when a task is actively running, and
 * a full chat/command panel when expanded. Minimal and unobtrusive when
 * closed, a real chat panel when open: persistent conversations,
 * context-aware replies, explicit loading/error states, and a clear
 * visual distinction between a plain reply and a proposed task. Nothing
 * in here claims a task has run for real.
 */
export function FloatingAssistant({ onViewTask, onViewScreen }: FloatingAssistantProps) {
  const previewMode = isPreviewModeActive();
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
  const [showScreenPanel, setShowScreenPanel] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskDetail | null>(null);
  const [workingDismissed, setWorkingDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { position, dragging, dragHandleProps } = useDraggablePosition();

  // Poll for a RUNNING task regardless of whether the panel is open, so
  // the "working" state can appear even while collapsed. Tasks never
  // execute autonomously in NEXUS today, so in practice this only ever
  // lights up from Preview Mode's simulated sample task — see
  // src/preview/mockData.ts — but the real path is the same `tasks.list`
  // / `tasks.get` calls the Tasks page uses, so it is ready the moment
  // real execution exists.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const list = await window.nexus.tasks.list();
        if (cancelled) return;
        const running: Task | undefined = list.find((t) => t.status === "RUNNING");
        if (!running) {
          setActiveTask(null);
          return;
        }
        const detail = await window.nexus.tasks.get({ taskId: running.id });
        if (cancelled) return;
        setActiveTask((prev) => {
          if (detail.id !== prev?.id) setWorkingDismissed(false);
          return detail;
        });
      } catch {
        // Silent — the chat panel surfaces load errors when opened; this
        // background poll shouldn't interrupt whatever page is showing.
      }
    }
    void poll();
    const interval = setInterval(() => void poll(), TASK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Let other parts of the dashboard (e.g. Overview's "Ask NEXUS" quick
  // action) open the assistant without App.tsx having to lift state.
  useEffect(() => {
    function handleOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("nexus:open-assistant", handleOpenRequest);
    return () => window.removeEventListener("nexus:open-assistant", handleOpenRequest);
  }, []);

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

  async function toggleAlwaysOnTop() {
    try {
      const result = await window.nexus.system.setAlwaysOnTop({ enabled: !alwaysOnTop });
      setAlwaysOnTop(result.enabled);
    } catch {
      // Best effort — Electron-only, and never critical to anything else here.
    }
  }

  function openFromWorking() {
    if (dragging) return;
    setOpen(true);
    if (activeTask) onViewTask(activeTask.id);
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;
  const widgetStyle = { right: position.right, bottom: position.bottom };
  const showWorkingPill = !open && activeTask && !workingDismissed;
  const runningStepIndex = activeTask?.steps.findIndex((s) => s.status === "RUNNING") ?? -1;
  const completedStepCount = activeTask?.steps.filter((s) => s.status === "COMPLETED").length ?? 0;
  const currentStepNumber = activeTask
    ? runningStepIndex >= 0
      ? runningStepIndex + 1
      : Math.min(completedStepCount + 1, activeTask.steps.length)
    : 0;

  return (
    <div
      className="pointer-events-none fixed z-50 flex flex-col items-end gap-2"
      style={widgetStyle}
    >
      {open ? (
        <div className="pointer-events-auto flex h-[560px] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-nexus-border bg-nexus-surface-raised shadow-xl shadow-black/30">
          <div
            className="flex cursor-grab items-center justify-between gap-2 border-b border-nexus-border px-4 py-3 active:cursor-grabbing"
            {...dragHandleProps}
          >
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
              <EmergencyStopButton compact />
              <button
                type="button"
                onClick={() => void toggleAlwaysOnTop()}
                disabled={previewMode}
                title={
                  previewMode
                    ? "Always-on-top is only available in the desktop app, not in browser Preview Mode."
                    : alwaysOnTop
                      ? "Stop keeping NEXUS above other windows"
                      : "Keep NEXUS above other windows"
                }
                aria-pressed={alwaysOnTop}
                aria-label="Toggle always-on-top"
                className={[
                  "rounded px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                  alwaysOnTop
                    ? "text-nexus-accent"
                    : "text-nexus-text-muted hover:bg-nexus-surface hover:text-nexus-text",
                ].join(" ")}
              >
                📌
              </button>
              <button
                type="button"
                onClick={() => setShowScreenPanel((value) => !value)}
                aria-pressed={showScreenPanel}
                aria-label="Screen observation"
                title="Screen observation"
                className={[
                  "rounded px-2 py-1 text-xs transition-colors",
                  showScreenPanel ? "text-nexus-accent" : "text-nexus-text-muted hover:bg-nexus-surface hover:text-nexus-text",
                ].join(" ")}
              >
                👁
              </button>
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

          {activeTask ? (
            <button
              type="button"
              onClick={() => onViewTask(activeTask.id)}
              className="flex w-full items-center justify-between gap-2 border-b border-nexus-border bg-nexus-accent-muted/40 px-4 py-2 text-left text-[11px] text-nexus-text transition-colors hover:bg-nexus-accent-muted/60"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-nexus-accent" />
                <span className="truncate">Working: {activeTask.title}</span>
              </span>
              <span className="shrink-0 text-nexus-text-faint">View →</span>
            </button>
          ) : null}

          {showScreenPanel ? (
            <ScreenObservationPanel
              onOpenWorkspace={() => {
                setOpen(false);
                onViewScreen();
              }}
            />
          ) : null}

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
      ) : showWorkingPill && activeTask ? (
        <div
          className="pointer-events-auto flex max-w-[280px] items-center gap-2 rounded-full border border-nexus-border bg-nexus-surface-raised px-3 py-2 shadow-md shadow-black/30"
          {...dragHandleProps}
        >
          <button
            type="button"
            onClick={openFromWorking}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nexus-accent/15 text-nexus-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-nexus-accent" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-nexus-text">{activeTask.title}</span>
              <span className="block text-[10px] text-nexus-text-faint">
                Working · step {currentStepNumber} of {activeTask.steps.length}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkingDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded px-1 text-xs text-nexus-text-faint hover:text-nexus-text"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!dragging) setOpen((prev) => !prev);
          }}
          aria-label="NEXUS assistant"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-nexus-border bg-nexus-surface-raised text-nexus-text-muted shadow-md shadow-black/30 transition-colors hover:text-nexus-accent"
          {...dragHandleProps}
        >
          <span className="text-sm font-semibold">N</span>
        </button>
      )}
    </div>
  );
}

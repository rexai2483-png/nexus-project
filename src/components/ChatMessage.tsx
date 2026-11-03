import type { Message, Task } from "@shared/types/models";
import { TaskProposalCard } from "./TaskProposalCard";

interface ChatMessageProps {
  message: Message;
  task?: Task;
  onViewTask: (taskId: string) => void;
}

/**
 * One chat bubble. Visually distinguishes a plain conversational reply
 * from a clarification question and from a proposed task — the task
 * case renders a nested TaskProposalCard rather than implying the task
 * is anything more than a proposal.
 */
export function ChatMessage({ message, task, onViewTask }: ChatMessageProps) {
  const isUser = message.role === "USER";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-nexus-accent-muted text-nexus-text" : "bg-nexus-surface text-nexus-text",
        ].join(" ")}
      >
        {!isUser && message.intent === "CLARIFICATION" ? (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-nexus-warning">
            Needs clarification
          </p>
        ) : null}
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        {task ? <TaskProposalCard task={task} onView={() => onViewTask(task.id)} /> : null}
        <p className="mt-1 text-right text-[10px] text-nexus-text-faint">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

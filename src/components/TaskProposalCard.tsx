import type { Task } from "@shared/types/models";

interface TaskProposalCardProps {
  task: Task;
  onView: () => void;
}

/** Inline card rendered under an assistant chat bubble that proposed a task. */
export function TaskProposalCard({ task, onView }: TaskProposalCardProps) {
  return (
    <div className="mt-2 rounded-md border border-nexus-border bg-nexus-bg p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-nexus-text">{task.title}</p>
        {task.sensitive ? (
          <span className="shrink-0 rounded border border-nexus-danger/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-danger">
            Sensitive
          </span>
        ) : null}
      </div>
      {task.objective ? <p className="mt-1 text-[11px] text-nexus-text-muted">{task.objective}</p> : null}
      <div className="mt-2 flex items-center justify-between text-[11px] text-nexus-text-faint">
        <span>
          {task.stepCount} step{task.stepCount === 1 ? "" : "s"} · Planned, not started
        </span>
        <button type="button" onClick={onView} className="font-medium text-nexus-accent hover:underline">
          View plan →
        </button>
      </div>
    </div>
  );
}

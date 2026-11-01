import type { TaskDetail } from "@shared/types/models";
import { TASK_STATUS_LABEL, TASK_STEP_STATUS_LABEL } from "../lib/taskLabels";
import { StatusDot } from "./StatusDot";

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function TaskDetailView({ task }: { task: TaskDetail }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-nexus-text">{task.title}</h3>
            {task.sensitive ? (
              <span className="rounded border border-nexus-danger/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-danger">
                Sensitive
              </span>
            ) : null}
          </div>
          {task.objective ? (
            <p className="mt-1 text-sm text-nexus-text-muted">{task.objective}</p>
          ) : null}
        </div>
        <StatusDot
          tone={task.pendingApprovalCount > 0 ? "warning" : "neutral"}
          label={TASK_STATUS_LABEL[task.status]}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs text-nexus-text-faint">
        <dt>Created</dt>
        <dd className="text-right text-nexus-text-muted">{formatTimestamp(task.createdAt)}</dd>
        <dt>Pending approvals</dt>
        <dd className="text-right text-nexus-text-muted">{task.pendingApprovalCount}</dd>
      </dl>

      {task.instruction ? (
        <div className="mt-4 rounded-md border border-nexus-border bg-nexus-bg p-3">
          <p className="text-[11px] uppercase tracking-wide text-nexus-text-faint">Original instruction</p>
          <p className="mt-1 text-sm text-nexus-text-muted">“{task.instruction}”</p>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
          Proposed steps · {task.steps.length}
        </p>
        <ol className="space-y-2">
          {task.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start justify-between gap-3 rounded-md border border-nexus-border bg-nexus-bg p-3 text-sm"
            >
              <div className="flex gap-3">
                <span className="mt-0.5 text-xs text-nexus-text-faint">{step.order}.</span>
                <span className="text-nexus-text">{step.description}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-nexus-text-faint">
                  {TASK_STEP_STATUS_LABEL[step.status]}
                </span>
                {step.requiresApproval ? (
                  <span className="rounded border border-nexus-warning/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-warning">
                    Needs approval
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {task.requiredResources.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
            Required applications / resources
          </p>
          <div className="flex flex-wrap gap-1.5">
            {task.requiredResources.map((resource) => (
              <span
                key={resource}
                className="rounded border border-nexus-border px-2 py-0.5 text-xs text-nexus-text-muted"
              >
                {resource}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {task.risks.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">Risks</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-nexus-text-muted">
            {task.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {task.completionCriteria ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
            Completion criteria
          </p>
          <p className="text-sm text-nexus-text-muted">{task.completionCriteria}</p>
        </div>
      ) : null}
    </div>
  );
}

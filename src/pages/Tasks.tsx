import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { TaskDetailView } from "../components/TaskDetailView";
import { useNexusQuery } from "../hooks/useNexusQuery";
import { requireNexusBridge } from "../lib/nexusBridge";
import { TASK_STATUS_LABEL } from "../lib/taskLabels";
import type { TaskDetail } from "@shared/types/models";

interface TasksProps {
  /** Set by App.tsx when the user clicks "View plan" in the assistant chat. */
  focusTaskId?: string | null;
  onFocusHandled?: () => void;
}

export function Tasks({ focusTaskId, onFocusHandled }: TasksProps) {
  const tasksQuery = useNexusQuery(() => requireNexusBridge().tasks.list(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Jump to a task opened from the assistant chat.
  useEffect(() => {
    if (focusTaskId) {
      setSelectedId(focusTaskId);
      onFocusHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId]);

  // Default to the most recent task once the list loads, if nothing is selected yet.
  useEffect(() => {
    if (!selectedId && tasksQuery.data && tasksQuery.data.length > 0) {
      setSelectedId(tasksQuery.data[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksQuery.data]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    // Same reasoning as useNexusQuery.ts: go through a resolved-promise
    // chain so a missing bridge (requireNexusBridge() throwing) lands in
    // `.catch()` below instead of escaping this effect uncaught.
    Promise.resolve()
      .then(() => requireNexusBridge().tasks.get({ taskId: selectedId }))
      .then((loaded) => {
        if (!cancelled) setDetail(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : "Unable to load task.");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Plans NEXUS has proposed from conversation. Nothing here executes automatically — every task is planned, not run."
      />

      {tasksQuery.loading ? (
        <Card>
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        </Card>
      ) : tasksQuery.error ? (
        <Card>
          <p className="text-sm text-nexus-danger">Unable to load tasks.</p>
          <p className="mt-1 text-xs text-nexus-text-muted">{tasksQuery.error}</p>
        </Card>
      ) : tasksQuery.data && tasksQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="p-0">
            <ul className="divide-y divide-nexus-border">
              {tasksQuery.data.map((task) => {
                const isSelected = task.id === selectedId;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      className={[
                        "block w-full px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-nexus-accent-muted" : "hover:bg-nexus-surface-raised",
                      ].join(" ")}
                    >
                      <p className="truncate text-sm text-nexus-text">{task.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-nexus-text-faint">
                        <span>{TASK_STATUS_LABEL[task.status]}</span>
                        {task.sensitive ? (
                          <span className="text-nexus-danger">Sensitive</span>
                        ) : null}
                        {task.pendingApprovalCount > 0 ? (
                          <span className="text-nexus-warning">
                            {task.pendingApprovalCount} awaiting approval
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            {detailLoading ? (
              <p className="text-sm text-nexus-text-faint">Loading task…</p>
            ) : detailError ? (
              <p className="text-sm text-nexus-danger">{detailError}</p>
            ) : detail ? (
              <TaskDetailView task={detail} />
            ) : (
              <EmptyState title="Select a task" description="Choose a task from the list to see its plan." />
            )}
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No tasks yet"
            description="Ask NEXUS to do something in the assistant panel — a proposed task and its steps will show up here before anything runs."
          />
        </Card>
      )}
    </div>
  );
}

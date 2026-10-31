import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { useNexusQuery } from "../hooks/useNexusQuery";

export function Tasks() {
  const tasks = useNexusQuery(() => window.nexus.tasks.list(), []);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Work NEXUS has been asked to carry out. Task execution is not implemented in this foundation release."
      />

      <Card>
        {tasks.loading ? (
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        ) : tasks.error ? (
          <p className="text-sm text-nexus-danger">Unable to load tasks.</p>
        ) : tasks.data && tasks.data.length > 0 ? (
          <ul className="divide-y divide-nexus-border">
            {tasks.data.map((task) => (
              <li key={task.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-nexus-text">{task.title}</span>
                <span className="text-xs uppercase tracking-wide text-nexus-text-faint">
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No tasks yet"
            description="When NEXUS can plan and run tasks, they will show up here with their steps and status."
          />
        )}
      </Card>
    </div>
  );
}

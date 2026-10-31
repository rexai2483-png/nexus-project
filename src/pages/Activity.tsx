import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { useNexusQuery } from "../hooks/useNexusQuery";

export function Activity() {
  const activity = useNexusQuery(() => window.nexus.activity.list({ limit: 100 }), []);

  return (
    <div>
      <PageHeader
        title="Activity"
        description="A real, append-only log of system events recorded by NEXUS."
      />

      <Card>
        {activity.loading ? (
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        ) : activity.error ? (
          <p className="text-sm text-nexus-danger">Unable to load activity.</p>
        ) : activity.data && activity.data.length > 0 ? (
          <ul className="divide-y divide-nexus-border">
            {activity.data.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="rounded border border-nexus-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-text-faint">
                    {event.source}
                  </span>
                  <span className="text-nexus-text">{event.message}</span>
                </div>
                <span className="shrink-0 text-xs text-nexus-text-faint">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No activity recorded yet"
            description="Startup, shutdown, and future task events will be logged here as they actually happen."
          />
        )}
      </Card>
    </div>
  );
}

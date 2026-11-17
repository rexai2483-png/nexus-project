import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { useNexusQuery } from "../hooks/useNexusQuery";
import type { SystemEventType } from "@shared/types/models";

const TYPE_FILTERS: Array<{ key: SystemEventType | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "INFO", label: "Info" },
  { key: "WARNING", label: "Warning" },
  { key: "ERROR", label: "Failed" },
  { key: "SECURITY", label: "Security" },
];

const TYPE_BADGE_CLASS: Record<SystemEventType, string> = {
  INFO: "bg-nexus-success/15 text-nexus-success",
  WARNING: "bg-nexus-warning/15 text-nexus-warning",
  ERROR: "bg-nexus-danger/15 text-nexus-danger",
  SECURITY: "bg-nexus-accent/15 text-nexus-accent",
};

const TYPE_LABEL: Record<SystemEventType, string> = {
  INFO: "Info",
  WARNING: "Warning",
  ERROR: "Failed",
  SECURITY: "Security",
};

export function Activity() {
  const activity = useNexusQuery(() => window.nexus.activity.list({ limit: 100 }), []);
  const [filter, setFilter] = useState<SystemEventType | "ALL">("ALL");

  const events = activity.data ?? [];
  const filtered = useMemo(
    () => (filter === "ALL" ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  );

  return (
    <div>
      <PageHeader
        title="Activity"
        description="A real, append-only log of system events recorded by NEXUS."
      />

      <div className="mb-4 flex gap-1 rounded-md border border-nexus-border p-1 text-xs">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={[
              "rounded px-2.5 py-1 transition-colors",
              filter === f.key
                ? "bg-nexus-accent-muted text-nexus-text"
                : "text-nexus-text-faint hover:text-nexus-text",
            ].join(" ")}
          >
            {f.label}
            {f.key !== "ALL" ? (
              <span className="ml-1 text-nexus-text-faint">({events.filter((e) => e.type === f.key).length})</span>
            ) : null}
          </button>
        ))}
      </div>

      <Card>
        {activity.loading ? (
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        ) : activity.error ? (
          <p className="text-sm text-nexus-danger">Unable to load activity.</p>
        ) : filtered.length > 0 ? (
          <ul className="divide-y divide-nexus-border">
            {filtered.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                      TYPE_BADGE_CLASS[event.type],
                    ].join(" ")}
                  >
                    {TYPE_LABEL[event.type]}
                  </span>
                  <span className="shrink-0 rounded border border-nexus-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-nexus-text-faint">
                    {event.source}
                  </span>
                  <span className="truncate text-nexus-text">{event.message}</span>
                </div>
                <span className="shrink-0 text-xs text-nexus-text-faint">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : events.length > 0 ? (
          <EmptyState title="No matching events" description="Try a different filter above." />
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

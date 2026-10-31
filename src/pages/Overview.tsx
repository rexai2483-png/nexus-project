import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { StatusDot } from "../components/StatusDot";
import { useNexusQuery } from "../hooks/useNexusQuery";

export function Overview() {
  const status = useNexusQuery(() => window.nexus.system.getStatus(), []);
  const activity = useNexusQuery(() => window.nexus.activity.list({ limit: 5 }), []);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="A snapshot of NEXUS on this machine."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="System status" subtitle="Live values reported by the running app">
          {status.loading ? (
            <p className="text-sm text-nexus-text-faint">Checking…</p>
          ) : status.error || !status.data ? (
            <p className="text-sm text-nexus-danger">Unable to read system status.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-nexus-text-faint">Connection</dt>
              <dd className="text-right">
                <StatusDot
                  tone={status.data.dbConnected ? "success" : "danger"}
                  label={status.data.dbConnected ? "Database connected" : "Database unreachable"}
                />
              </dd>

              <dt className="text-nexus-text-faint">Platform</dt>
              <dd className="text-right text-nexus-text">
                {status.data.platform} ({status.data.arch})
              </dd>

              <dt className="text-nexus-text-faint">App version</dt>
              <dd className="text-right text-nexus-text">{status.data.appVersion}</dd>

              <dt className="text-nexus-text-faint">Electron</dt>
              <dd className="text-right text-nexus-text">{status.data.electronVersion}</dd>

              <dt className="text-nexus-text-faint">Node.js</dt>
              <dd className="text-right text-nexus-text">{status.data.nodeVersion}</dd>

              <dt className="text-nexus-text-faint">Uptime</dt>
              <dd className="text-right text-nexus-text">{status.data.uptimeSeconds}s</dd>
            </dl>
          )}
        </Card>

        <Card title="Recent activity" subtitle="Latest system events">
          {activity.loading ? (
            <p className="text-sm text-nexus-text-faint">Loading…</p>
          ) : activity.error ? (
            <p className="text-sm text-nexus-danger">Unable to load activity.</p>
          ) : activity.data && activity.data.length > 0 ? (
            <ul className="space-y-3">
              {activity.data.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-nexus-text">{event.message}</span>
                  <span className="shrink-0 text-xs text-nexus-text-faint">
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No activity yet"
              description="System events will appear here as NEXUS runs."
            />
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Task workspace" subtitle="Nothing queued">
          <EmptyState
            title="No tasks yet"
            description="Task creation and execution are not available in this foundation release."
          />
        </Card>
      </div>
    </div>
  );
}

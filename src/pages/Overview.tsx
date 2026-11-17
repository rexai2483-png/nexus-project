import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { StatusDot } from "../components/StatusDot";
import { useNexusQuery } from "../hooks/useNexusQuery";
import { TASK_STATUS_LABEL } from "../lib/taskLabels";
import { isPreviewModeActive } from "../lib/nexusBridge";
import type { NavKey } from "../types/navigation";

interface OverviewProps {
  onNavigate: (key: NavKey) => void;
}

function openAssistant() {
  window.dispatchEvent(new Event("nexus:open-assistant"));
}

export function Overview({ onNavigate }: OverviewProps) {
  const previewMode = isPreviewModeActive();
  const status = useNexusQuery(() => window.nexus.system.getStatus(), []);
  const activity = useNexusQuery(() => window.nexus.activity.list({ limit: 5 }), []);
  const tasks = useNexusQuery(() => window.nexus.tasks.list(), []);
  const agentStatus = useNexusQuery(() => window.nexus.agent.getStatus(), []);
  const aiStatus = useNexusQuery(() => window.nexus.ai.getStatus(), []);

  const agentTone =
    agentStatus.data?.connectionState === "CONNECTED"
      ? "success"
      : agentStatus.data?.connectionState === "CONNECTING"
        ? "warning"
        : "neutral";

  return (
    <div>
      <PageHeader
        title="Overview"
        description={
          previewMode
            ? "A snapshot of NEXUS using sample Preview Mode data — no backend is connected."
            : "A snapshot of NEXUS on this machine."
        }
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
                {previewMode ? (
                  <StatusDot tone="neutral" label="Preview data — no real database" />
                ) : (
                  <StatusDot
                    tone={status.data.dbConnected ? "success" : "danger"}
                    label={status.data.dbConnected ? "Database connected" : "Database unreachable"}
                  />
                )}
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

        <Card title="Agent & AI status" subtitle="Windows Agent connection and AI provider">
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-nexus-text-faint">Windows Agent</span>
              {agentStatus.loading ? (
                <span className="text-xs text-nexus-text-faint">Checking…</span>
              ) : agentStatus.error || !agentStatus.data ? (
                <span className="text-xs text-nexus-danger">Unavailable</span>
              ) : (
                <StatusDot tone={agentTone} label={agentStatus.data.connectionState} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-nexus-text-faint">AI provider</span>
              {aiStatus.loading ? (
                <span className="text-xs text-nexus-text-faint">Checking…</span>
              ) : aiStatus.error || !aiStatus.data ? (
                <span className="text-xs text-nexus-danger">Unavailable</span>
              ) : (
                <StatusDot
                  tone={aiStatus.data.configured ? "success" : "warning"}
                  label={
                    aiStatus.data.configured
                      ? `${aiStatus.data.provider} · ${aiStatus.data.model}`
                      : "Not configured"
                  }
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate("agent")}
              className="w-full rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text"
            >
              Open Agent page →
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <button
            type="button"
            onClick={() => onNavigate("activity")}
            className="mt-4 text-xs font-medium text-nexus-accent hover:underline"
          >
            View all activity →
          </button>
        </Card>

        <Card title="Quick actions" subtitle="Jump straight to the most common next step">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={openAssistant}
              className="rounded-md border border-nexus-border px-3 py-2 text-left text-xs text-nexus-text-muted transition-colors hover:border-nexus-accent/50 hover:text-nexus-text"
            >
              <span className="block font-medium text-nexus-text">Ask NEXUS</span>
              Open the assistant and describe something to plan.
            </button>
            <button
              type="button"
              onClick={() => onNavigate("tasks")}
              className="rounded-md border border-nexus-border px-3 py-2 text-left text-xs text-nexus-text-muted transition-colors hover:border-nexus-accent/50 hover:text-nexus-text"
            >
              <span className="block font-medium text-nexus-text">Review tasks</span>
              See proposed plans and their steps.
            </button>
            <button
              type="button"
              onClick={() => onNavigate("agent")}
              className="rounded-md border border-nexus-border px-3 py-2 text-left text-xs text-nexus-text-muted transition-colors hover:border-nexus-accent/50 hover:text-nexus-text"
            >
              <span className="block font-medium text-nexus-text">Windows Agent</span>
              Check connection status and pending approvals.
            </button>
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="rounded-md border border-nexus-border px-3 py-2 text-left text-xs text-nexus-text-muted transition-colors hover:border-nexus-accent/50 hover:text-nexus-text"
            >
              <span className="block font-medium text-nexus-text">Settings</span>
              AI provider, permissions, and appearance.
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Task workspace"
          subtitle={
            tasks.data && tasks.data.length > 0
              ? `${tasks.data.length} proposed task${tasks.data.length === 1 ? "" : "s"}`
              : "Nothing proposed yet"
          }
        >
          {tasks.loading ? (
            <p className="text-sm text-nexus-text-faint">Loading…</p>
          ) : tasks.error ? (
            <p className="text-sm text-nexus-danger">Unable to load tasks.</p>
          ) : tasks.data && tasks.data.length > 0 ? (
            <ul className="divide-y divide-nexus-border">
              {tasks.data.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <button
                    type="button"
                    onClick={() => onNavigate("tasks")}
                    className="truncate text-left text-nexus-text hover:text-nexus-accent"
                  >
                    {task.title}
                  </button>
                  <span className="shrink-0 text-xs text-nexus-text-faint">
                    {TASK_STATUS_LABEL[task.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No tasks yet"
              description="Ask NEXUS to do something in the assistant panel — proposed tasks appear here before anything runs."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

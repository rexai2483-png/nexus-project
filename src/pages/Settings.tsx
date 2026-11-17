import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { StatusDot } from "../components/StatusDot";
import { useNexusQuery } from "../hooks/useNexusQuery";
import { AGENT_ACTION_CATALOG } from "@shared/types/agentActions";
import { APPROVED_APPLICATIONS, APPROVED_SHORTCUTS } from "@shared/types/agentApprovedApps";
import type { UserSettings } from "@shared/types/models";
import type { NavKey } from "../types/navigation";

interface SettingsProps {
  onNavigate: (key: NavKey) => void;
}

const PERMISSION_TONE: Record<string, string> = {
  LOW: "text-nexus-success",
  ELEVATED: "text-nexus-warning",
  SENSITIVE: "text-nexus-danger",
};

export function Settings({ onNavigate }: SettingsProps) {
  const settingsQuery = useNexusQuery(() => window.nexus.settings.get(), []);
  const aiStatus = useNexusQuery(() => window.nexus.ai.getStatus(), []);
  const agentStatus = useNexusQuery(() => window.nexus.agent.getStatus(), []);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const current = settings ?? settingsQuery.data;

  async function applyChange(partial: Partial<Pick<UserSettings, "theme" | "launchOnStartup" | "telemetryEnabled">>) {
    setSaving(true);
    try {
      const updated = await window.nexus.settings.update(partial);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Local preferences, stored only on this device."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Appearance">
          {!current ? (
            <p className="text-sm text-nexus-text-faint">Loading…</p>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="text-nexus-text-muted">Theme</span>
              <div className="flex gap-1 rounded-md border border-nexus-border p-1">
                {(["dark", "light", "system"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    disabled={saving}
                    onClick={() => applyChange({ theme })}
                    className={[
                      "rounded px-2.5 py-1 text-xs capitalize transition-colors",
                      current.theme === theme
                        ? "bg-nexus-accent-muted text-nexus-text"
                        : "text-nexus-text-faint hover:text-nexus-text",
                    ].join(" ")}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="General">
          {!current ? (
            <p className="text-sm text-nexus-text-faint">Loading…</p>
          ) : (
            <div className="space-y-4 text-sm">
              <label className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Launch NEXUS on startup</span>
                <input
                  type="checkbox"
                  checked={current.launchOnStartup}
                  disabled={saving}
                  onChange={(e) => applyChange({ launchOnStartup: e.target.checked })}
                  className="h-4 w-4 accent-nexus-accent"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Share anonymous usage telemetry</span>
                <input
                  type="checkbox"
                  checked={current.telemetryEnabled}
                  disabled={saving}
                  onChange={(e) => applyChange({ telemetryEnabled: e.target.checked })}
                  className="h-4 w-4 accent-nexus-accent"
                />
              </label>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="AI provider"
          subtitle="Configured through environment variables, never through the UI"
        >
          {aiStatus.loading ? (
            <p className="text-sm text-nexus-text-faint">Checking…</p>
          ) : aiStatus.error || !aiStatus.data ? (
            <p className="text-sm text-nexus-danger">Unable to read AI status.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Status</span>
                <StatusDot
                  tone={aiStatus.data.configured ? "success" : "warning"}
                  label={aiStatus.data.configured ? "Configured" : "Not configured"}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Provider</span>
                <span className="text-nexus-text">{aiStatus.data.provider}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Model</span>
                <span className="text-nexus-text">{aiStatus.data.model}</span>
              </div>
              <p className="text-xs text-nexus-text-faint">
                To change provider or model, set <code>AI_PROVIDER</code>, <code>AI_MODEL</code>, and{" "}
                <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> file and restart NEXUS. API keys are never
                stored in the database or sent anywhere but the configured provider.
              </p>
            </div>
          )}
        </Card>

        <Card title="Agent configuration" subtitle="Windows Agent session, reachable in full on the Agent page">
          {agentStatus.loading ? (
            <p className="text-sm text-nexus-text-faint">Checking…</p>
          ) : agentStatus.error || !agentStatus.data ? (
            <p className="text-sm text-nexus-danger">Unable to read agent status.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Connection</span>
                <StatusDot
                  tone={agentStatus.data.connectionState === "CONNECTED" ? "success" : "neutral"}
                  label={agentStatus.data.connectionState}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Platform</span>
                <span className="text-nexus-text">{agentStatus.data.platform ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-nexus-text-muted">Active actions</span>
                <span className="text-nexus-text">{agentStatus.data.activeActionCount}</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("agent")}
                className="w-full rounded-md border border-nexus-border px-3 py-1.5 text-xs text-nexus-text-muted transition-colors hover:text-nexus-text"
              >
                Manage the Windows Agent →
              </button>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Permissions"
          subtitle="What the Windows Agent is allowed to touch — fixed catalog, not user-editable"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
                Action permission levels
              </p>
              <ul className="space-y-1.5 text-sm">
                {Object.values(AGENT_ACTION_CATALOG).map((def) => (
                  <li key={def.type} className="flex items-center justify-between gap-3">
                    <span className="truncate text-nexus-text-muted" title={def.description}>
                      {def.label}
                    </span>
                    <span className={["shrink-0 text-xs font-medium", PERMISSION_TONE[def.permissionLevel]].join(" ")}>
                      {def.permissionLevel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
                Approved applications
              </p>
              <div className="flex flex-wrap gap-1.5">
                {APPROVED_APPLICATIONS.map((app) => (
                  <span key={app.id} className="rounded border border-nexus-border px-2 py-0.5 text-xs text-nexus-text-muted">
                    {app.label}
                  </span>
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-nexus-text-faint">
                Approved shortcuts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {APPROVED_SHORTCUTS.map((shortcut) => (
                  <span key={shortcut.id} className="rounded border border-nexus-border px-2 py-0.5 text-xs text-nexus-text-muted">
                    {shortcut.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

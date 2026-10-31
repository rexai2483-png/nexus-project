import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { useNexusQuery } from "../hooks/useNexusQuery";
import type { UserSettings } from "@shared/types/models";

export function Settings() {
  const settingsQuery = useNexusQuery(() => window.nexus.settings.get(), []);
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

      <div className="mt-4">
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
    </div>
  );
}

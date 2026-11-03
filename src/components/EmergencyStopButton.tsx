import { useState } from "react";

interface EmergencyStopButtonProps {
  /** Compact variant for tight spaces like the floating assistant header. */
  compact?: boolean;
  onStopped?: () => void;
}

/**
 * The Emergency STOP control. Required to be reachable from both the
 * main dashboard (Agent page) and the floating assistant — this one
 * component is reused in both places rather than duplicating the call.
 *
 * Always calls the real `agent:emergencyStop` IPC channel; never
 * simulates success. A short confirmation step guards against an
 * accidental click given how disruptive a real stop is.
 */
export function EmergencyStopButton({ compact, onStopped }: EmergencyStopButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await window.nexus.agent.emergencyStop();
      onStopped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop the agent.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void activate()}
          disabled={busy}
          className="rounded-md bg-nexus-danger px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {busy ? "Stopping…" : "Confirm STOP"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-md px-2 py-1.5 text-xs text-nexus-text-muted hover:text-nexus-text"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Immediately halt the Windows Agent: cancels active actions, releases held input, and requires a restart."
        className={[
          "flex items-center gap-1.5 rounded-md border border-nexus-danger/50 bg-nexus-danger/10 font-semibold text-nexus-danger transition-colors hover:bg-nexus-danger/20",
          compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        ].join(" ")}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-nexus-danger" />
        Emergency STOP
      </button>
      {error ? <span className="text-[11px] text-nexus-danger">{error}</span> : null}
    </div>
  );
}

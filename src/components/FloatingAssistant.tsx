import { useState } from "react";

/**
 * Minimal, unobtrusive placeholder for the future assistant surface.
 * Intentionally does nothing beyond showing a static note — no
 * simulated conversation, no fake responses. Reasoning and automation
 * land in a later phase.
 */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="pointer-events-auto w-64 rounded-lg border border-nexus-border bg-nexus-surface-raised p-4 shadow-lg shadow-black/30">
          <p className="text-sm font-medium text-nexus-text">Assistant</p>
          <p className="mt-1 text-xs leading-relaxed text-nexus-text-muted">
            Not active yet. Reasoning and computer control arrive in a later
            phase of NEXUS.
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="NEXUS assistant"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-nexus-border bg-nexus-surface-raised text-nexus-text-muted shadow-md shadow-black/30 transition-colors hover:text-nexus-accent"
      >
        <span className="text-sm font-semibold">N</span>
      </button>
    </div>
  );
}

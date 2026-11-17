/**
 * Persistent, clearly-visible indicator that the dashboard is running
 * against Preview Mode's mock data instead of a real Electron backend.
 * Rendered unconditionally (not dismissible) for as long as Preview
 * Mode is active — see src/lib/nexusBridge.ts for when that is — so
 * sample tasks, activity, and conversations are never mistaken for a
 * real user's data.
 */
export function PreviewModeBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-nexus-warning/40 bg-nexus-warning/15 px-4 py-1.5 text-center text-xs font-medium text-nexus-warning">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nexus-warning" />
      <span className="tracking-wide">PREVIEW MODE</span>
      <span className="text-nexus-warning/80">
        — Browser preview with sample data. No Electron backend, AI provider, or Windows Agent is connected;
        nothing here is real, and no simulated action ever reaches a real computer.
      </span>
    </div>
  );
}

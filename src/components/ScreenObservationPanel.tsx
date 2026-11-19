import { useCallback, useEffect, useState } from "react";
import type { ScreenCapture } from "@shared/types/screenVision";

interface ScreenObservationPanelProps {
  onOpenWorkspace: () => void;
}

const ANALYSIS_LABEL: Record<ScreenCapture["analysisStatus"], string> = {
  NOT_REQUESTED: "Not analyzed yet",
  PENDING: "Analyzing…",
  ANALYZED: "Analyzed",
  FAILED: "Analysis failed",
};

/**
 * Compact "what did NEXUS last see" panel for the floating assistant —
 * a thumbnail of the single latest screen capture plus a one-click path
 * to the full Screen workspace. Deliberately read-only except for one
 * "Capture screen now" button, which submits the exact same explicit,
 * approved agent action the Screen workspace and Agent page do — there
 * is no separate/implicit capture path here.
 */
export function ScreenObservationPanel({ onOpenWorkspace }: ScreenObservationPanelProps) {
  const [latest, setLatest] = useState<ScreenCapture | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [captures, status] = await Promise.all([
        window.nexus.screen.listCaptures({ limit: 1 }),
        window.nexus.agent.getStatus(),
      ]);
      setLatest(captures[0] ?? null);
      setConnected(status.connectionState === "CONNECTED");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load screen captures.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!latest) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    window.nexus.screen
      .getImageDataUrl({ captureId: latest.id })
      .then((result) => {
        if (!cancelled) setImageUrl(result.dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [latest]);

  async function captureNow() {
    setCapturing(true);
    setError(null);
    try {
      await window.nexus.agent.submitAction({ actionType: "screen.captureScreenshot", parameters: {} });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture the screen.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="border-b border-nexus-border bg-nexus-bg px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-nexus-text">Screen observation</p>
        <button type="button" onClick={onOpenWorkspace} className="text-[11px] font-medium text-nexus-accent hover:underline">
          Open workspace →
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-nexus-text-faint">Loading…</p>
      ) : error ? (
        <p className="text-xs text-nexus-danger">{error}</p>
      ) : latest ? (
        <div className="flex gap-3">
          {imageUrl ? (
            <img src={imageUrl} alt="Latest capture" className="h-14 w-20 shrink-0 rounded border border-nexus-border object-cover" />
          ) : (
            <div className="h-14 w-20 shrink-0 rounded border border-nexus-border bg-nexus-surface" />
          )}
          <div className="min-w-0 flex-1 text-[11px] text-nexus-text-faint">
            <p className="truncate text-nexus-text">{latest.activeWindowTitle ?? "Full desktop"}</p>
            <p>{new Date(latest.capturedAt).toLocaleTimeString()}</p>
            <p>{ANALYSIS_LABEL[latest.analysisStatus]}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-nexus-text-faint">No screen captures yet.</p>
      )}

      <button
        type="button"
        disabled={capturing || !connected}
        onClick={() => void captureNow()}
        title={connected ? undefined : "Start the Windows Agent on the Agent page first."}
        className="mt-3 w-full rounded-md border border-nexus-border px-2 py-1.5 text-[11px] text-nexus-text-muted transition-colors hover:text-nexus-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        {capturing ? "Capturing…" : connected ? "Capture screen now" : "Agent not connected"}
      </button>
    </div>
  );
}

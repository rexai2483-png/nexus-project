import { useCallback, useEffect, useState } from "react";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusDot } from "../components/StatusDot";
import { EmergencyStopButton } from "../components/EmergencyStopButton";
import { APPROVED_APPLICATIONS, APPROVED_SHORTCUTS } from "@shared/types/agentApprovedApps";
import type { AgentActionType } from "@shared/types/agentActions";
import type { AgentAction, AgentStatusSnapshot, ApprovalRequest } from "@shared/types/models";

const POLL_INTERVAL_MS = 2000;

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString() : "—";
}

function resultSummary(action: AgentAction): string {
  if (action.status === "SUCCEEDED") {
    return JSON.stringify(action.result ?? {}).slice(0, 140);
  }
  if (action.errorMessage) {
    return `${action.errorCode ?? "ERROR"}: ${action.errorMessage}`.slice(0, 140);
  }
  return "—";
}

export function Agent() {
  const [status, setStatus] = useState<AgentStatusSnapshot | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Quick-action form state
  const [typeText, setTypeText] = useState("Hello from NEXUS.");
  const [shortcutId, setShortcutId] = useState(APPROVED_SHORTCUTS[0]?.id ?? "");
  const [moveX, setMoveX] = useState(100);
  const [moveY, setMoveY] = useState(100);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextActions, nextApprovals] = await Promise.all([
        window.nexus.agent.getStatus(),
        window.nexus.agent.listActions({ limit: 30 }),
        window.nexus.approvals.listPending(),
      ]);
      setStatus(nextStatus);
      setActions(nextActions);
      setApprovals(nextApprovals.filter((approval) => approval.agentActionId !== null));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusyAction(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `"${label}" failed.`);
    } finally {
      setBusyAction(null);
    }
  }

  function submit(actionType: AgentActionType, parameters: Record<string, unknown>, label: string) {
    return run(label, () => window.nexus.agent.submitAction({ actionType, parameters }));
  }

  const connected = status?.connectionState === "CONNECTED";
  const tone = status?.connectionState === "CONNECTED" ? "success" : status?.connectionState === "CONNECTING" ? "warning" : "neutral";

  return (
    <div>
      <PageHeader
        title="Windows Agent"
        description="Controlled, validated automation — every action below is explicitly submitted and runs through the same approval and registry checks NEXUS enforces for real."
        action={<EmergencyStopButton onStopped={() => void refresh()} />}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <StatusDot tone={tone} label={status?.connectionState ?? "DISCONNECTED"} />
            <span className="text-xs text-nexus-text-faint">
              Session: {status?.sessionId ? `${status.sessionId.slice(0, 10)}… (${status.sessionStatus})` : "none"}
            </span>
            <span className="text-xs text-nexus-text-faint">Platform: {status?.platform ?? "—"}</span>
            <span className="text-xs text-nexus-text-faint">
              Last heartbeat: {formatTime(status?.lastHeartbeatAt ?? null)}
            </span>
            <span className="text-xs text-nexus-text-faint">Active actions: {status?.activeActionCount ?? 0}</span>
            {status?.haltedUntilRestart ? (
              <span className="text-xs font-medium text-nexus-danger">Halted — restart required</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busyAction !== null || connected}
              onClick={() => void run("start", () => window.nexus.agent.start())}
              className="rounded-md bg-nexus-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {busyAction === "start" ? "Starting…" : "Start Agent"}
            </button>
            <button
              type="button"
              disabled={busyAction !== null || !status || status.connectionState === "DISCONNECTED"}
              onClick={() => void run("stop", () => window.nexus.agent.stop())}
              className="rounded-md border border-nexus-border px-3 py-1.5 text-xs font-medium text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              {busyAction === "stop" ? "Stopping…" : "Stop Agent"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-xs text-nexus-danger">{error}</p> : null}
      </Card>

      <Card title="Quick actions" subtitle="Each button submits one explicit, validated action — matching the sprint's required test scenarios." className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 rounded-md border border-nexus-border p-3">
            <p className="text-xs font-medium text-nexus-text">App management</p>
            {APPROVED_APPLICATIONS.slice(0, 2).map((app) => (
              <div key={app.id} className="flex gap-1.5">
                <button
                  type="button"
                  disabled={!connected || busyAction !== null}
                  onClick={() => void submit("app.launch", { appId: app.id }, `launch-${app.id}`)}
                  className="flex-1 rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
                >
                  Launch {app.label}
                </button>
                <button
                  type="button"
                  disabled={!connected || busyAction !== null}
                  onClick={() => void submit("app.isRunning", { appId: app.id }, `isRunning-${app.id}`)}
                  className="flex-1 rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
                >
                  Is running?
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() => void submit("app.getActiveWindow", {}, "getActiveWindow")}
              className="w-full rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              Get active window
            </button>
          </div>

          <div className="space-y-2 rounded-md border border-nexus-border p-3">
            <p className="text-xs font-medium text-nexus-text">Screen</p>
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() => void submit("screen.captureScreenshot", {}, "captureScreenshot")}
              className="w-full rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              Capture screenshot
            </button>
          </div>

          <div className="space-y-2 rounded-md border border-nexus-border p-3">
            <p className="text-xs font-medium text-nexus-text">Mouse / keyboard</p>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={moveX}
                onChange={(e) => setMoveX(Number(e.target.value))}
                className="w-14 rounded border border-nexus-border bg-nexus-bg px-1.5 py-1 text-[11px] text-nexus-text"
              />
              <input
                type="number"
                value={moveY}
                onChange={(e) => setMoveY(Number(e.target.value))}
                className="w-14 rounded border border-nexus-border bg-nexus-bg px-1.5 py-1 text-[11px] text-nexus-text"
              />
              <button
                type="button"
                disabled={!connected || busyAction !== null}
                onClick={() => void submit("input.moveMouse", { x: moveX, y: moveY }, "moveMouse")}
                className="flex-1 rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
              >
                Move
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                value={typeText}
                onChange={(e) => setTypeText(e.target.value)}
                className="flex-1 rounded border border-nexus-border bg-nexus-bg px-1.5 py-1 text-[11px] text-nexus-text"
              />
              <button
                type="button"
                disabled={!connected || busyAction !== null}
                onClick={() => void submit("input.typeText", { text: typeText }, "typeText")}
                className="rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
              >
                Type
              </button>
            </div>
            <div className="flex gap-1.5">
              <select
                value={shortcutId}
                onChange={(e) => setShortcutId(e.target.value)}
                className="flex-1 rounded border border-nexus-border bg-nexus-bg px-1.5 py-1 text-[11px] text-nexus-text"
              >
                {APPROVED_SHORTCUTS.map((shortcut) => (
                  <option key={shortcut.id} value={shortcut.id}>
                    {shortcut.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!connected || busyAction !== null}
                onClick={() => void submit("input.sendShortcut", { shortcut: shortcutId }, "sendShortcut")}
                className="rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-nexus-border p-3">
            <p className="text-xs font-medium text-nexus-text">Files (sandboxed workspace)</p>
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() => void submit("fs.createFolder", { path: "nexus-sprint2-test" }, "createFolder")}
              className="w-full rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              Create test folder
            </button>
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() =>
                void submit(
                  "fs.createFile",
                  { path: "nexus-sprint2-test/hello.txt", content: "Hello from NEXUS Sprint 2 testing." },
                  "createFile",
                )
              }
              className="w-full rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              Create test file
            </button>
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() => void submit("fs.listDirectory", { path: "" }, "listDirectory")}
              className="w-full rounded border border-nexus-border px-2 py-1 text-[11px] text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
            >
              List workspace root
            </button>
          </div>

          <div className="space-y-2 rounded-md border border-nexus-danger/40 p-3">
            <p className="text-xs font-medium text-nexus-text">Validation test</p>
            <button
              type="button"
              disabled={!connected || busyAction !== null}
              onClick={() => void submit("app.launch", { appId: "not-an-approved-app" }, "invalidAction")}
              className="w-full rounded border border-nexus-danger/50 px-2 py-1 text-[11px] text-nexus-danger hover:bg-nexus-danger/10 disabled:opacity-40"
            >
              Submit an invalid action
            </button>
          </div>
        </div>
      </Card>

      <Card title="Pending approvals" subtitle="Each approval applies only to the exact action it was created for." className="mb-4">
        {approvals.length === 0 ? (
          <p className="text-xs text-nexus-text-faint">Nothing is awaiting approval.</p>
        ) : (
          <ul className="divide-y divide-nexus-border">
            {approvals.map((approval) => (
              <li key={approval.id} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-nexus-text">{approval.title}</p>
                  <p className="text-xs text-nexus-text-faint">{approval.description}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void run(`approve-${approval.id}`, () =>
                        window.nexus.approvals.decide({ approvalRequestId: approval.id, decision: "APPROVED" }),
                      )
                    }
                    className="rounded-md bg-nexus-success px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(`deny-${approval.id}`, () =>
                        window.nexus.approvals.decide({ approvalRequestId: approval.id, decision: "DENIED" }),
                      )
                    }
                    className="rounded-md border border-nexus-border px-2.5 py-1 text-xs text-nexus-text-muted hover:text-nexus-text"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent actions" subtitle="Real execution results — nothing here is simulated.">
        {loading ? (
          <p className="text-sm text-nexus-text-faint">Loading…</p>
        ) : actions.length === 0 ? (
          <EmptyState title="No actions yet" description="Submit a quick action above to see it appear here with its real result." />
        ) : (
          <ul className="divide-y divide-nexus-border">
            {actions.map((action) => (
              <li key={action.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-nexus-text">{action.type}</span>
                    <span
                      className={[
                        "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                        action.status === "SUCCEEDED"
                          ? "bg-nexus-success/15 text-nexus-success"
                          : action.status === "FAILED" || action.status === "REJECTED"
                            ? "bg-nexus-danger/15 text-nexus-danger"
                            : action.status === "CANCELLED"
                              ? "bg-nexus-warning/15 text-nexus-warning"
                              : "bg-nexus-text-faint/15 text-nexus-text-faint",
                      ].join(" ")}
                    >
                      {action.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-nexus-text-faint">{resultSummary(action)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-nexus-text-faint">
                  <span>{formatTime(action.submittedAt)}</span>
                  {action.status === "RUNNING" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void run(`cancel-${action.id}`, () =>
                          window.nexus.agent.cancelAction({ actionId: action.id }),
                        )
                      }
                      className="rounded border border-nexus-border px-2 py-0.5 text-nexus-text-muted hover:text-nexus-text"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

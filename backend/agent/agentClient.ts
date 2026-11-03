import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type { AgentActionType } from "../../shared/types/agentActions";
import type {
  AgentActionResult,
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentRuntimeStatus,
} from "../../shared/types/agentProtocol";

export interface AgentClientEvents {
  onAuthenticated?: () => void;
  onHeartbeat?: (status: AgentRuntimeStatus) => void;
  onActionStarted?: (actionId: string, startedAt: string) => void;
  onActionResult?: (
    actionId: string,
    result: AgentActionResult,
    startedAt: string,
    completedAt: string,
  ) => void;
  onStopped?: (completedActionIds: string[], interruptedActionIds: string[], stoppedAt: string) => void;
  onFatal?: (message: string) => void;
  /** Fired when the authenticated socket connection drops. */
  onSocketDisconnected?: () => void;
  /** Fired when the underlying OS process exits, for any reason. */
  onProcessExit?: (code: number | null) => void;
}

function resolveAgentEntrypoint(): string {
  // app.getAppPath() is the project root in dev and the packaged app's
  // resources root in production — dist-agent is built alongside
  // dist-electron by `npm run build` (see package.json).
  return path.join(app.getAppPath(), "dist-agent", "agent", "index.js");
}

function resolveSocketPath(sessionId: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\nexus-agent-${sessionId}`;
  }
  const dir = path.join(app.getPath("userData"), "agent-ipc");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sessionId}.sock`);
}

function resolveAgentDataDir(): string {
  return path.join(app.getPath("userData"), "agent-data");
}

function resolveWorkspaceRoot(): string {
  // "Documents/NEXUS Workspace" is the Windows-idiomatic default. Some
  // platforms don't expose a meaningful "documents" path; fall back to
  // the home directory rather than failing to start.
  try {
    const documents = app.getPath("documents");
    if (documents) return path.join(documents, "NEXUS Workspace");
  } catch {
    // fall through to the home-directory default below
  }
  return path.join(os.homedir(), "NEXUS Workspace");
}

/**
 * Owns the OS-level agent child process and the authenticated local
 * socket connection to it. This is transport only — spawning, the
 * handshake, framing, and raw send/receive. Session/action lifecycle,
 * approval gating, and database persistence live one layer up in
 * backend/agent/agentManager.ts.
 */
export class AgentClient {
  readonly sessionId: string;
  readonly socketPath: string;
  private readonly token: string;
  private child: ChildProcess | null = null;
  private socket: net.Socket | null = null;
  private buffer = "";
  private authenticated = false;
  private pendingAuth: { resolve: () => void; reject: (err: Error) => void } | null = null;

  constructor(private readonly events: AgentClientEvents) {
    this.sessionId = randomUUID();
    this.socketPath = resolveSocketPath(this.sessionId);
    this.token = randomBytes(32).toString("hex");
  }

  get isConnected(): boolean {
    return this.authenticated;
  }

  get processAlive(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  async start(): Promise<void> {
    const entrypoint = resolveAgentEntrypoint();
    if (!fs.existsSync(entrypoint)) {
      throw new Error(`Agent entrypoint not found at "${entrypoint}". Run "npm run build:agent" first.`);
    }

    this.child = spawn(process.execPath, [entrypoint], {
      env: {
        ...process.env,
        NEXUS_AGENT_SOCKET_PATH: this.socketPath,
        NEXUS_AGENT_TOKEN: this.token,
        NEXUS_AGENT_DATA_DIR: resolveAgentDataDir(),
        NEXUS_AGENT_WORKSPACE_ROOT: resolveWorkspaceRoot(),
        // Runs the Electron binary as a plain Node process — no Electron
        // APIs, no renderer, no elevated privileges of any kind.
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.on("exit", (code) => {
      this.authenticated = false;
      this.socket = null;
      this.events.onProcessExit?.(code);
    });

    await this.waitForReadySignal();
    await this.connectAndAuthenticate();
  }

  private waitForReadySignal(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Timed out waiting for the agent process to become ready."));
        }
      }, 10_000);

      const onData = (chunk: Buffer) => {
        if (!settled && chunk.toString("utf8").includes("NEXUS_AGENT_READY")) {
          settled = true;
          clearTimeout(timer);
          this.child?.stdout?.removeListener("data", onData);
          resolve();
        }
      };
      this.child?.stdout?.on("data", onData);
      this.child?.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[nexus-agent] ${chunk.toString("utf8")}`);
      });
      this.child?.once("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
      this.child?.once("exit", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Agent process exited early (code ${code}) before becoming ready.`));
        }
      });
    });
  }

  /** Re-establishes the socket connection without spawning a new process — the recovery path for a dropped-but-still-alive agent. */
  async reconnect(): Promise<void> {
    if (!this.processAlive) {
      throw new Error("Cannot reconnect: the agent process is no longer running.");
    }
    await this.connectAndAuthenticate();
  }

  private connectAndAuthenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      this.socket = socket;
      this.buffer = "";
      this.pendingAuth = { resolve, reject };

      socket.once("connect", () => {
        this.send({ type: "auth", token: this.token });
      });
      socket.on("data", (chunk: Buffer) => this.onData(chunk));
      socket.once("error", (err) => {
        this.pendingAuth?.reject(err);
        this.pendingAuth = null;
      });
      socket.on("close", () => {
        const wasAuthenticated = this.authenticated;
        this.authenticated = false;
        if (this.socket === socket) this.socket = null;
        if (wasAuthenticated) this.events.onSocketDisconnected?.();
      });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0) {
        this.handleMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleMessage(raw: string): void {
    let message: AgentOutboundMessage;
    try {
      message = JSON.parse(raw) as AgentOutboundMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case "auth.ok":
        this.authenticated = true;
        this.pendingAuth?.resolve();
        this.pendingAuth = null;
        this.events.onAuthenticated?.();
        break;
      case "auth.failed":
        this.pendingAuth?.reject(new Error(message.reason));
        this.pendingAuth = null;
        break;
      case "heartbeat.pong":
        this.events.onHeartbeat?.(message.status);
        break;
      case "action.started":
        this.events.onActionStarted?.(message.actionId, message.startedAt);
        break;
      case "action.result":
        this.events.onActionResult?.(message.actionId, message.result, message.startedAt, message.completedAt);
        break;
      case "agent.stopped":
        this.events.onStopped?.(message.completedActionIds, message.interruptedActionIds, message.stoppedAt);
        break;
      case "fatal":
        this.events.onFatal?.(message.message);
        break;
      default:
        break;
    }
  }

  private send(message: AgentInboundMessage): void {
    this.socket?.write(`${JSON.stringify(message)}\n`);
  }

  sendHeartbeatPing(): void {
    this.send({ type: "heartbeat.ping" });
  }

  submitAction(actionId: string, actionType: AgentActionType, parameters: Record<string, unknown>): void {
    this.send({ type: "action.submit", actionId, actionType, parameters });
  }

  cancelAction(actionId: string): void {
    this.send({ type: "action.cancel", actionId });
  }

  requestStop(): void {
    this.send({ type: "agent.stop" });
  }

  terminate(): void {
    this.socket?.end();
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      this.child.kill();
    }
  }
}

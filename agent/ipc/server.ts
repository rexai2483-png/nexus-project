import net from "node:net";
import type {
  AgentInboundMessage,
  AgentOutboundMessage,
  AgentRuntimeStatus,
} from "../../shared/types/agentProtocol";
import { executeAction } from "../actions/registry";
import { releaseAllInputs } from "../actions/input";

interface ActiveAction {
  controller: AbortController;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The agent's local IPC server. Listens on a Unix domain socket (or a
 * Windows named pipe — `net.createServer().listen(path)` already
 * handles `\\.\pipe\...` paths natively on win32) and speaks the
 * newline-delimited JSON protocol in shared/types/agentProtocol.ts.
 *
 * Single-client by design: only the backend that spawned this process
 * (and knows the per-launch token passed via environment variable) can
 * ever do anything useful with the connection. Every message other
 * than the first `auth` one is rejected until authentication succeeds.
 */
export class AgentServer {
  private readonly server: net.Server;
  private socket: net.Socket | null = null;
  private authenticated = false;
  private buffer = "";
  private halted = false;
  private readonly startedAt = Date.now();
  private readonly activeActions = new Map<string, ActiveAction>();
  private readonly completedActionIds: string[] = [];
  private onStoppedCallback: (() => void) | null = null;

  constructor(
    private readonly socketPath: string,
    private readonly token: string,
  ) {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      this.server.once("error", onError);
      this.server.listen(this.socketPath, () => {
        this.server.removeListener("error", onError);
        resolve();
      });
    });
  }

  /** Registers a callback fired once emergency-stop finishes reporting. */
  onStopped(callback: () => void): void {
    this.onStoppedCallback = callback;
  }

  private handleConnection(socket: net.Socket): void {
    if (this.socket) {
      // Single-client design — a second connection attempt is refused.
      socket.destroy();
      return;
    }
    this.socket = socket;
    this.authenticated = false;
    this.buffer = "";

    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
        this.authenticated = false;
      }
    });
    socket.on("error", () => {
      // Surfaced to the caller via the 'close' event that follows.
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0) {
        void this.handleMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private send(message: AgentOutboundMessage): void {
    this.socket?.write(`${JSON.stringify(message)}\n`);
  }

  private async handleMessage(raw: string): Promise<void> {
    let message: AgentInboundMessage;
    try {
      message = JSON.parse(raw) as AgentInboundMessage;
    } catch {
      this.send({ type: "fatal", message: "Received a malformed (non-JSON) message." });
      return;
    }

    if (!this.authenticated) {
      if (message.type === "auth" && message.token === this.token) {
        this.authenticated = true;
        this.send({ type: "auth.ok" });
      } else {
        this.send({ type: "auth.failed", reason: "Invalid or missing token." });
        this.socket?.destroy();
      }
      return;
    }

    switch (message.type) {
      case "heartbeat.ping":
        this.send({ type: "heartbeat.pong", status: this.getStatus() });
        break;
      case "action.submit":
        await this.runAction(message.actionId, message.actionType, message.parameters);
        break;
      case "action.cancel":
        this.cancelAction(message.actionId);
        break;
      case "agent.stop":
        await this.emergencyStop();
        break;
      case "auth":
        // Already authenticated; a repeat auth message is a no-op.
        break;
      default:
        break;
    }
  }

  private getStatus(): AgentRuntimeStatus {
    return {
      platform: process.platform,
      haltedUntilRestart: this.halted,
      activeActionCount: this.activeActions.size,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }

  private async runAction(
    actionId: string,
    actionType: string,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    if (this.halted) {
      const now = new Date().toISOString();
      this.send({
        type: "action.result",
        actionId,
        result: {
          ok: false,
          errorCode: "HALTED",
          message: "The agent is halted after an emergency stop and requires an explicit restart.",
        },
        startedAt: now,
        completedAt: now,
      });
      return;
    }

    const controller = new AbortController();
    this.activeActions.set(actionId, { controller });
    const startedAt = new Date().toISOString();
    this.send({ type: "action.started", actionId, startedAt });

    const result = await executeAction(actionType, parameters, controller.signal);

    this.activeActions.delete(actionId);
    // "Completed" and "interrupted" must stay disjoint for the emergency-
    // stop report: a cancelled action is already captured by the
    // interrupted-snapshot taken in emergencyStop() below, so it must
    // NOT also be counted as completed just because its (cancelled)
    // result eventually came back.
    if (!(result.ok === false && result.errorCode === "CANCELLED")) {
      this.completedActionIds.push(actionId);
    }
    this.send({ type: "action.result", actionId, result, startedAt, completedAt: new Date().toISOString() });
  }

  private cancelAction(actionId: string): void {
    const active = this.activeActions.get(actionId);
    active?.controller.abort();
  }

  /**
   * Emergency STOP: refuse new actions immediately, cancel every
   * cancellable active action, release any held mouse/keyboard input,
   * and report exactly which actions completed vs. were interrupted.
   * The agent then halts permanently — a fresh process must be spawned
   * to do anything else, which is the "explicit restart" requirement.
   */
  private async emergencyStop(): Promise<void> {
    this.halted = true;
    const interrupted = Array.from(this.activeActions.keys());
    for (const active of this.activeActions.values()) {
      active.controller.abort();
    }
    // Briefly let aborted handlers unwind before we snapshot "completed".
    await sleep(50);
    await releaseAllInputs();

    this.send({
      type: "agent.stopped",
      completedActionIds: [...this.completedActionIds],
      interruptedActionIds: interrupted,
      stoppedAt: new Date().toISOString(),
    });

    this.onStoppedCallback?.();
  }

  async close(): Promise<void> {
    this.socket?.end();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

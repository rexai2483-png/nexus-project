import { ensureAgentDirectories, WORKSPACE_ROOT } from "./paths";
import { AgentServer } from "./ipc/server";

// Importing these registers their actions as a side effect (see each
// module's call to registerAction()). This is the complete capability
// set for Sprint 2 — nothing else can run.
import "./actions/apps";
import "./actions/screen";
import "./actions/input";
import "./actions/files";

/**
 * Standalone Windows Agent process entry point. Deliberately a plain
 * Node process (not Electron) so it can run with ordinary OS user
 * privileges — it is spawned by the backend (backend/agent/agentClient.ts)
 * with two required environment variables:
 *
 *   NEXUS_AGENT_SOCKET_PATH - Unix socket path / Windows named pipe path
 *   NEXUS_AGENT_TOKEN       - random per-launch token the backend must
 *                             present in the first message or the
 *                             connection is refused
 *
 * It never runs as administrator and never elevates itself.
 */
async function main(): Promise<void> {
  const socketPath = process.env.NEXUS_AGENT_SOCKET_PATH;
  const token = process.env.NEXUS_AGENT_TOKEN;

  if (!socketPath || !token) {
    process.stderr.write(
      "NEXUS Agent: missing NEXUS_AGENT_SOCKET_PATH or NEXUS_AGENT_TOKEN environment variable.\n",
    );
    process.exit(1);
    return;
  }

  ensureAgentDirectories();

  const server = new AgentServer(socketPath, token);
  server.onStopped(() => {
    // Emergency stop requires an explicit restart: exit the OS process
    // entirely rather than resetting in-memory state, so "starting the
    // agent again" always means a genuinely fresh process.
    setTimeout(() => process.exit(0), 100);
  });

  await server.listen();
  process.stdout.write(`NEXUS_AGENT_READY workspace=${WORKSPACE_ROOT}\n`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  process.stderr.write(`NEXUS Agent failed to start: ${err instanceof Error ? err.stack ?? err.message : err}\n`);
  process.exit(1);
});

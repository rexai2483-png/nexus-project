import { spawn } from "node:child_process";
import { getActiveWindow } from "@nut-tree-fork/nut-js";
import { APPROVED_APPLICATIONS, type ApprovedAppDefinition } from "../../shared/types/agentApprovedApps";
import { registerAction } from "./registry";

/**
 * App-management actions. Launch targets are resolved exclusively from
 * the hardcoded APPROVED_APPLICATIONS catalog — the agent never spawns
 * an arbitrary string an AI or a user supplied, only a known
 * executable name attached to a known `appId`.
 */

function resolveApprovedApp(appId: unknown): ApprovedAppDefinition {
  if (typeof appId !== "string") {
    throw new Error('"appId" must be a string.');
  }
  const app = APPROVED_APPLICATIONS.find((candidate) => candidate.id === appId);
  if (!app) {
    throw new Error(`"${appId}" is not an approved application.`);
  }
  return app;
}

function checkProcessRunning(imageName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    // Windows uses tasklist to query by image name; other platforms (used
    // only for local development/testing of the mechanism itself, since
    // the product targets Windows 10/11) fall back to pgrep.
    const command = isWindows ? "tasklist" : "pgrep";
    const args = isWindows ? ["/FI", `IMAGENAME eq ${imageName}`, "/FO", "CSV", "/NH"] : ["-f", imageName];
    const child = spawn(command, args);
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", () => {
      if (isWindows) {
        resolve(stdout.toLowerCase().includes(imageName.toLowerCase()));
      } else {
        resolve(stdout.trim().length > 0);
      }
    });
  });
}

registerAction("app.launch", async (parameters) => {
  const app = resolveApprovedApp(parameters.appId);
  const child = spawn(app.win32Executable, [], { detached: true, stdio: "ignore" });
  const pid = await new Promise<number | null>((resolve, reject) => {
    child.once("spawn", () => resolve(child.pid ?? null));
    child.once("error", reject);
  });
  child.unref();
  return { appId: app.id, executable: app.win32Executable, pid };
});

registerAction("app.isRunning", async (parameters) => {
  const app = resolveApprovedApp(parameters.appId);
  const running = await checkProcessRunning(app.win32Executable);
  return { appId: app.id, executable: app.win32Executable, running };
});

registerAction("app.getActiveWindow", async () => {
  const activeWindow = await getActiveWindow();
  const [title, region] = await Promise.all([activeWindow.title, activeWindow.region]);
  return {
    title,
    region: { left: region.left, top: region.top, width: region.width, height: region.height },
  };
});

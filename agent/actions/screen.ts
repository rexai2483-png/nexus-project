import { randomUUID } from "node:crypto";
import { FileType, getActiveWindow, screen } from "@nut-tree-fork/nut-js";
import type { Region } from "@nut-tree-fork/shared";
import { SCREENSHOT_DIR } from "../paths";
import { registerAction } from "./registry";

/**
 * Screen observation. Every capture goes through one of these two
 * registered actions — there is no code path anywhere in the agent that
 * captures a screenshot without it being submitted, validated, logged,
 * and reported back to the backend like any other action. That is the
 * concrete guarantee behind "screenshots must never be captured
 * secretly."
 */

interface ActiveWindowSnapshot {
  /** The real {@link Region} instance, for captureRegion() — nut-js Region has methods, so a plain object won't do. */
  region: Region;
  /** Plain, JSON-serializable copy for the action's result payload. */
  metadata: { title: string; region: { left: number; top: number; width: number; height: number } };
}

/**
 * Best-effort active-window metadata captured alongside every
 * screenshot. Never fatal for `screen.captureScreenshot` — a platform or
 * window manager without an active-window concept (there is no window
 * manager at all in this project's Linux sandbox dev environment) simply
 * means the capture has no window metadata attached, not a failed
 * capture. `screen.captureActiveWindow` treats this as required, since
 * without it there is no window region to actually capture.
 */
async function readActiveWindow(): Promise<ActiveWindowSnapshot | null> {
  try {
    const win = await getActiveWindow();
    const [title, region] = await Promise.all([win.title, win.region]);
    return {
      region,
      metadata: {
        title,
        region: { left: region.left, top: region.top, width: region.width, height: region.height },
      },
    };
  } catch {
    return null;
  }
}

registerAction("screen.captureScreenshot", async () => {
  const fileName = `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const savedPath = await screen.capture(fileName, FileType.PNG, SCREENSHOT_DIR);
  const active = await readActiveWindow();
  return { path: savedPath, capturedAt: new Date().toISOString(), activeWindow: active?.metadata ?? null };
});

registerAction("screen.captureActiveWindow", async () => {
  const active = await readActiveWindow();
  if (!active) {
    throw new Error(
      "No active window is available to capture — none is focused, or window metadata isn't available on this platform.",
    );
  }
  const fileName = `window-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const savedPath = await screen.captureRegion(fileName, active.region, FileType.PNG, SCREENSHOT_DIR);
  return { path: savedPath, capturedAt: new Date().toISOString(), activeWindow: active.metadata };
});

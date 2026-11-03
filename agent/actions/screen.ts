import { randomUUID } from "node:crypto";
import { FileType, screen } from "@nut-tree-fork/nut-js";
import { SCREENSHOT_DIR } from "../paths";
import { registerAction } from "./registry";

/**
 * Screen observation. Every capture goes through this single registered
 * action — there is no code path anywhere in the agent that captures a
 * screenshot without it being submitted, validated, logged, and
 * reported back to the backend like any other action. That is the
 * concrete guarantee behind "screenshots must never be captured
 * secretly."
 */
registerAction("screen.captureScreenshot", async () => {
  const fileName = `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const savedPath = await screen.capture(fileName, FileType.PNG, SCREENSHOT_DIR);
  return { path: savedPath, capturedAt: new Date().toISOString() };
});

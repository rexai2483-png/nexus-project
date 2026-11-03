import { Button, Key, keyboard, mouse } from "@nut-tree-fork/nut-js";
import { registerAction } from "./registry";

/**
 * Mouse/keyboard actions. Coordinate-based mouse control is provided
 * because it's unavoidable for pointer movement/clicking, but
 * `app.getActiveWindow` (agent/actions/apps.ts) already goes through
 * nut.js's accessibility-backed window query rather than raw pixel
 * scanning, which is the "prefer UI Automation/accessibility APIs"
 * requirement applied to the one capability this sprint implements
 * that can use it (window/element identification). Coordinate clicks
 * remain available for cases with no accessible UI handle.
 */

const SHORTCUT_KEY_MAP: Record<string, Key[]> = {
  save: [Key.LeftControl, Key.S],
  copy: [Key.LeftControl, Key.C],
  paste: [Key.LeftControl, Key.V],
  selectAll: [Key.LeftControl, Key.A],
  undo: [Key.LeftControl, Key.Z],
};

registerAction("input.moveMouse", async (parameters) => {
  const x = parameters.x as number;
  const y = parameters.y as number;
  await mouse.setPosition({ x, y });
  return { x, y };
});

registerAction("input.click", async (parameters) => {
  const x = parameters.x as number;
  const y = parameters.y as number;
  const buttonParam = (parameters.button as string | undefined) ?? "left";
  const button = buttonParam === "right" ? Button.RIGHT : Button.LEFT;
  await mouse.setPosition({ x, y });
  await mouse.click(button);
  return { x, y, button: buttonParam };
});

registerAction("input.typeText", async (parameters) => {
  const text = parameters.text as string;
  await keyboard.type(text);
  return { charactersTyped: text.length };
});

registerAction("input.sendShortcut", async (parameters) => {
  const shortcutId = parameters.shortcut as string;
  const keys = SHORTCUT_KEY_MAP[shortcutId];
  if (!keys) {
    throw new Error(`"${shortcutId}" is not an approved shortcut.`);
  }
  await keyboard.pressKey(...keys);
  await keyboard.releaseKey(...keys);
  return { shortcut: shortcutId };
});

/**
 * Releases every modifier key and mouse button the agent could
 * plausibly be holding down. Called by the IPC server's emergency-stop
 * handler so a halted agent never leaves a stuck Ctrl/Shift/mouse-button
 * behind on the real desktop — best-effort: platform quirks on an
 * individual key must never stop the rest from being released.
 */
export async function releaseAllInputs(): Promise<void> {
  const buttons = [Button.LEFT, Button.RIGHT, Button.MIDDLE];
  for (const button of buttons) {
    try {
      await mouse.releaseButton(button);
    } catch {
      // best-effort
    }
  }
  const modifiers = [
    Key.LeftControl,
    Key.RightControl,
    Key.LeftShift,
    Key.RightShift,
    Key.LeftAlt,
    Key.RightAlt,
    Key.LeftSuper,
    Key.RightSuper,
  ];
  for (const key of modifiers) {
    try {
      await keyboard.releaseKey(key);
    } catch {
      // best-effort
    }
  }
}

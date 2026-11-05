import type { NexusBridge } from "@shared/types/ipc";

/**
 * `window.nexus` only exists once Electron's preload script has run
 * (see electron/preload.ts's `contextBridge.exposeInMainWorld`). That
 * only happens inside the full desktop app (`npm run dev` / `npm
 * start`) — launching just the Vite dev server (`npm run dev:renderer`
 * / `pnpm dev:renderer`) serves the renderer with no Electron process,
 * no preload bridge, and no backend behind it, so `window.nexus` is
 * genuinely `undefined` there. That is expected, not a bug — but
 * reading a property off it unguarded (`window.nexus.tasks.list()`)
 * throws a cryptic `Cannot read properties of undefined` instead of
 * telling the developer what's actually missing.
 */
export class NexusBridgeUnavailableError extends Error {
  constructor() {
    super(
      "NEXUS backend is not connected. This page needs the full desktop app " +
        "(the Electron main process + preload bridge), not just the Vite " +
        "renderer. Run `npm run dev` (or `pnpm dev`) instead of " +
        "`dev:renderer` alone to start everything.",
    );
    this.name = "NexusBridgeUnavailableError";
  }
}

/** True only when the Electron preload bridge actually injected `window.nexus`. */
export function isNexusBridgeAvailable(): boolean {
  return typeof window !== "undefined" && window.nexus != null;
}

/**
 * Returns the real `window.nexus` bridge, or throws a clear, actionable
 * `NexusBridgeUnavailableError` instead of letting a raw property
 * access crash with an opaque TypeError. Use this anywhere a component
 * is about to call into `window.nexus` for the first time in an effect
 * or event handler.
 */
export function requireNexusBridge(): NexusBridge {
  if (!isNexusBridgeAvailable()) {
    throw new NexusBridgeUnavailableError();
  }
  return window.nexus;
}

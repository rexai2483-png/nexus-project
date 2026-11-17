import type { NexusBridge } from "@shared/types/ipc";
import { createMockNexusBridge } from "../preview/mockBridge";

/**
 * `window.nexus` only exists once Electron's preload script has run
 * (see electron/preload.ts's `contextBridge.exposeInMainWorld`). That
 * only happens inside the full desktop app (`npm run dev` / `npm
 * start`) — launching just the Vite dev server (`npm run dev:renderer`
 * / `pnpm dev:renderer`) serves the renderer with no Electron process,
 * no preload bridge, and no backend behind it, so `window.nexus` is
 * genuinely `undefined` there.
 *
 * In a development build (`import.meta.env.DEV`) that's not treated as
 * an error: `installPreviewBridgeIfNeeded()` below transparently installs
 * a mock implementation of the exact same `NexusBridge` contract (see
 * src/preview/mockBridge.ts) so the whole dashboard, every page, and the
 * floating assistant work unmodified against realistic sample data —
 * this is NEXUS's browser Preview Mode. It never activates in a
 * production build, and it never touches the real Electron bridge when
 * one IS present (Electron always wins).
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

/** True only when the real Electron preload bridge injected `window.nexus` — never true for the Preview Mode mock. */
export function isElectronBridgeAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.nexus) && !previewModeActive;
}

let previewModeActive = false;

/**
 * Installs the Preview Mode mock bridge onto `window.nexus`, but only
 * when ALL of the following hold:
 *  - this is a Vite dev build (`import.meta.env.DEV` — false in any
 *    production build, so Preview Mode can never silently activate
 *    there),
 *  - `window.nexus` is not already set (a real Electron preload bridge
 *    always takes priority and is never overwritten).
 *
 * Called once, at module load, from the bottom of this file — every
 * other export in this module (and every page importing it) observes
 * the result, never the pre-install state.
 */
function installPreviewBridgeIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (window.nexus != null) return;
  // Vite only sets `import.meta.env.DEV` to true for `vite`/`vite dev` —
  // a production `vite build` bundles it as the literal `false`, so this
  // branch is dead code (and Preview Mode is unreachable) in any build
  // shipped to a user.
  if (!import.meta.env.DEV) return;

  window.nexus = createMockNexusBridge();
  previewModeActive = true;
}

/** True when the dashboard is running against the Preview Mode mock bridge instead of a real Electron backend. */
export function isPreviewModeActive(): boolean {
  return previewModeActive;
}

/** True once `window.nexus` is callable at all — either the real Electron bridge, or (in dev) the Preview Mode mock. */
export function isNexusBridgeAvailable(): boolean {
  return typeof window !== "undefined" && window.nexus != null;
}

/**
 * Returns a usable `NexusBridge` — the real one in Electron, the
 * Preview Mode mock in a browser-only dev build, or throws a clear,
 * actionable `NexusBridgeUnavailableError` in the one remaining case
 * (a production build with no Electron preload, which should not
 * normally happen). Use this anywhere a component is about to call
 * into `window.nexus` for the first time in an effect or event handler.
 */
export function requireNexusBridge(): NexusBridge {
  if (!isNexusBridgeAvailable()) {
    throw new NexusBridgeUnavailableError();
  }
  return window.nexus;
}

installPreviewBridgeIfNeeded();

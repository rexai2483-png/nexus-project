import type { NexusBridge } from "@shared/types/ipc";

declare global {
  interface Window {
    /**
     * The only surface the renderer has for talking to the main
     * process / backend. Exposed by electron/preload.ts via
     * `contextBridge.exposeInMainWorld`. There is no Node.js, no
     * filesystem, and no shell access beyond these typed methods.
     *
     * Typed as always-present because that is the real contract once
     * NEXUS is launched correctly (the full Electron app — preload
     * runs before the renderer ever loads). It is NOT present when the
     * renderer is served on its own (`npm run dev:renderer` / `pnpm
     * dev:renderer` without the rest of `npm run dev`) — there is no
     * Electron process and nothing ever calls
     * `contextBridge.exposeInMainWorld`. Code that might run in that
     * renderer-only mode (any component mounted unconditionally, e.g.
     * on first paint) must go through
     * `src/lib/nexusBridge.ts#requireNexusBridge()` /
     * `isNexusBridgeAvailable()` instead of reading `window.nexus`
     * directly, so a missing bridge produces a clear, actionable error
     * instead of a raw `Cannot read properties of undefined`.
     */
    nexus: NexusBridge;
  }
}

export {};

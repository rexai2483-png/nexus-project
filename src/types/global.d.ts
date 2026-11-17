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
     * runs before the renderer ever loads). It is NOT injected by
     * Electron when the renderer is served on its own (`npm run
     * dev:renderer` / `pnpm dev:renderer` without the rest of `npm run
     * dev`) — there is no Electron process and nothing ever calls
     * `contextBridge.exposeInMainWorld`. In that case, in a dev build
     * only, `src/lib/nexusBridge.ts` installs a mock implementing this
     * exact interface instead (NEXUS's browser Preview Mode) — so by
     * the time any component renders, `window.nexus` is either the
     * real bridge or that mock, never actually `undefined`, in both
     * dev and production. Code that runs before that install is
     * guaranteed to have happened (which is effectively none — see
     * nexusBridge.ts) should still prefer
     * `src/lib/nexusBridge.ts#requireNexusBridge()` /
     * `isNexusBridgeAvailable()` over reading `window.nexus` directly,
     * so the one remaining failure case (a production build with no
     * Electron preload) produces a clear, actionable error instead of
     * a raw `Cannot read properties of undefined`.
     */
    nexus: NexusBridge;
  }
}

export {};

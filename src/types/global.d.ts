import type { NexusBridge } from "@shared/types/ipc";

declare global {
  interface Window {
    /**
     * The only surface the renderer has for talking to the main
     * process / backend. Exposed by electron/preload.ts via
     * `contextBridge.exposeInMainWorld`. There is no Node.js, no
     * filesystem, and no shell access beyond these typed methods.
     */
    nexus: NexusBridge;
  }
}

export {};

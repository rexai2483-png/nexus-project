import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// NEXUS renderer build configuration.
// The renderer is a plain web app bundled by Vite; it never talks to
// Node.js or the filesystem directly. All privileged operations go
// through the typed IPC bridge exposed by electron/preload.ts.
const rootDir = import.meta.dirname;

export default defineConfig({
  root: path.resolve(rootDir, "src"),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
});

import { useState, type JSX } from "react";
import { Sidebar } from "./components/Sidebar";
import { FloatingAssistant } from "./components/FloatingAssistant";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Overview } from "./pages/Overview";
import { Tasks } from "./pages/Tasks";
import { Agent } from "./pages/Agent";
import { Activity } from "./pages/Activity";
import { Memory } from "./pages/Memory";
import { Settings } from "./pages/Settings";
import { NAV_ITEMS, type NavKey } from "./types/navigation";
import { isNexusBridgeAvailable } from "./lib/nexusBridge";

const NAV_LABEL: Record<NavKey, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.key, item.label]),
) as Record<NavKey, string>;

export default function App() {
  const [active, setActive] = useState<NavKey>("overview");
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  // Computed once per render, not memoized — window.nexus either exists
  // for the whole lifetime of this tab (Electron preload ran before the
  // renderer did) or never will, so there's nothing to react to here.
  const bridgeAvailable = isNexusBridgeAvailable();

  function viewTask(taskId: string) {
    setFocusTaskId(taskId);
    setActive("tasks");
  }

  const PAGES: Record<NavKey, () => JSX.Element> = {
    overview: Overview,
    tasks: () => (
      <Tasks focusTaskId={focusTaskId} onFocusHandled={() => setFocusTaskId(null)} />
    ),
    agent: Agent,
    activity: Activity,
    memory: Memory,
    settings: Settings,
  };
  const ActivePage = PAGES[active];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-nexus-bg text-nexus-text">
      <Sidebar active={active} onSelect={setActive} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        {!bridgeAvailable ? (
          <div className="mb-4 rounded-md border border-nexus-warning/40 bg-nexus-warning/10 px-4 py-2.5 text-xs text-nexus-warning">
            Renderer-only preview — no backend connected. This is the Vite dev
            server on its own (e.g. <code>dev:renderer</code>); the Electron app,
            database, AI, and Windows Agent are not running, so pages below will
            show a connection error instead of real data. Run{" "}
            <code>npm run dev</code> (or <code>pnpm dev</code>) to start the full
            desktop app.
          </div>
        ) : null}
        {/* Keying by `active` resets the boundary when the user navigates
            away from a page that crashed, instead of pinning the whole
            app on a stale error. */}
        <ErrorBoundary key={active} label={NAV_LABEL[active]}>
          <ActivePage />
        </ErrorBoundary>
      </main>
      {/* FloatingAssistant reads window.nexus the same unguarded way Tasks
          used to, and is mounted on every page — contain it the same way. */}
      <ErrorBoundary label="Assistant">
        <FloatingAssistant onViewTask={viewTask} />
      </ErrorBoundary>
    </div>
  );
}

import { useState, type JSX } from "react";
import { Sidebar } from "./components/Sidebar";
import { FloatingAssistant } from "./components/FloatingAssistant";
import { Overview } from "./pages/Overview";
import { Tasks } from "./pages/Tasks";
import { Activity } from "./pages/Activity";
import { Memory } from "./pages/Memory";
import { Settings } from "./pages/Settings";
import type { NavKey } from "./types/navigation";

export default function App() {
  const [active, setActive] = useState<NavKey>("overview");
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  function viewTask(taskId: string) {
    setFocusTaskId(taskId);
    setActive("tasks");
  }

  const PAGES: Record<NavKey, () => JSX.Element> = {
    overview: Overview,
    tasks: () => (
      <Tasks focusTaskId={focusTaskId} onFocusHandled={() => setFocusTaskId(null)} />
    ),
    activity: Activity,
    memory: Memory,
    settings: Settings,
  };
  const ActivePage = PAGES[active];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-nexus-bg text-nexus-text">
      <Sidebar active={active} onSelect={setActive} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <ActivePage />
      </main>
      <FloatingAssistant onViewTask={viewTask} />
    </div>
  );
}

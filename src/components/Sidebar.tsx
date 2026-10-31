import { NAV_ITEMS, type NavKey } from "../types/navigation";
import { NAV_ICONS } from "./icons";

interface SidebarProps {
  active: NavKey;
  onSelect: (key: NavKey) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 flex-col border-r border-nexus-border bg-nexus-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-nexus-accent/15 text-nexus-accent">
          <span className="text-[13px] font-semibold">N</span>
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide text-nexus-text">NEXUS</p>
          <p className="text-[11px] text-nexus-text-faint">AI Computer Operator</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.key];
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={[
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-nexus-accent-muted text-nexus-text"
                  : "text-nexus-text-muted hover:bg-nexus-surface-raised hover:text-nexus-text",
              ].join(" ")}
            >
              <Icon className={isActive ? "text-nexus-accent" : "text-nexus-text-faint"} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-nexus-border px-4 py-3">
        <p className="text-[11px] text-nexus-text-faint">v0.1.0 · foundation build</p>
      </div>
    </aside>
  );
}

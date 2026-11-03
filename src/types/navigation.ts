export type NavKey = "overview" | "tasks" | "agent" | "activity" | "memory" | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "agent", label: "Agent" },
  { key: "activity", label: "Activity" },
  { key: "memory", label: "Memory" },
  { key: "settings", label: "Settings" },
];

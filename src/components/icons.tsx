import type { JSX, SVGProps } from "react";
import type { NavKey } from "../types/navigation";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

function OverviewIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function TasksIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

function ActivityIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h4l2 7 4-14 2 7h6" />
    </svg>
  );
}

function MemoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16M15 4v16M4 9h16M4 15h16" opacity="0.5" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h8M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 12h2M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 17h10M18 17h2" />
      <circle cx="16" cy="17" r="2" />
    </svg>
  );
}

export const NAV_ICONS: Record<NavKey, (props: IconProps) => JSX.Element> = {
  overview: OverviewIcon,
  tasks: TasksIcon,
  activity: ActivityIcon,
  memory: MemoryIcon,
  settings: SettingsIcon,
};

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-nexus-success",
  warning: "bg-nexus-warning",
  danger: "bg-nexus-danger",
  neutral: "bg-nexus-text-faint",
};

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-nexus-text-muted">
      <span className={["h-1.5 w-1.5 rounded-full", TONE_CLASS[tone]].join(" ")} />
      {label}
    </span>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-nexus-border px-6 py-14 text-center">
      <div className="mb-3 h-9 w-9 rounded-full border border-nexus-border" />
      <p className="text-sm font-medium text-nexus-text">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-nexus-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

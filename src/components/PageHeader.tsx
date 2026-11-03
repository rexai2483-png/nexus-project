interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-nexus-text">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-nexus-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

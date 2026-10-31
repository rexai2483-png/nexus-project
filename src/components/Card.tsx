interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, subtitle, children, className }: CardProps) {
  return (
    <section
      className={[
        "rounded-lg border border-nexus-border bg-nexus-surface p-5",
        className ?? "",
      ].join(" ")}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="text-sm font-medium text-nexus-text">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-nexus-text-faint">{subtitle}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

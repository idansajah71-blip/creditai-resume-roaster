export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: "neutral" | "success" | "warning" | "danger" | "accent";
  children: React.ReactNode;
  className?: string;
}) {
  const cls =
    variant === "success"
      ? "bg-success-soft text-success"
      : variant === "warning"
        ? "bg-warning-soft text-warning"
        : variant === "danger"
          ? "bg-danger-soft text-danger"
          : variant === "accent"
            ? "bg-accent-soft text-accent"
            : "bg-surface-muted text-ink-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls} ${className}`}>
      {children}
    </span>
  );
}
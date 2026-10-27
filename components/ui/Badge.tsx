type Variant = "neutral" | "success" | "warning" | "danger" | "met" | "partial" | "missing";

/* Small bordered uppercase mono labels, not pills with heavy fills. */
const styles: Record<Exclude<Variant, "met" | "partial" | "missing">, string> = {
  neutral: "border-line-strong bg-sheet text-ink-2",
  success: "border-green/40 bg-green-soft text-green",
  warning: "border-amber/40 bg-amber-soft text-amber",
  danger: "border-red-pen/40 bg-red-soft text-red-pen",
};

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}) {
  const key =
    variant === "met" ? "success" : variant === "partial" ? "warning" : variant === "missing" ? "danger" : variant;
  return (
    <span
      className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase leading-[16px] tracking-[0.08em] ${styles[key]} ${className}`}
    >
      {children}
    </span>
  );
}

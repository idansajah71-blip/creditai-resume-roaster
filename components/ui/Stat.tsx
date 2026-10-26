export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">{label}</div>
      <div className="mt-2 font-mono text-2xl text-ink">{value}</div>
    </div>
  );
}
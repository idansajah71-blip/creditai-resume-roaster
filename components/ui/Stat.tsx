export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <div className="type-label">{label}</div>
      <div className="mt-2 font-mono text-[28px] leading-8 text-ink [font-variant-numeric:tabular-nums]">
        {value}
      </div>
    </div>
  );
}

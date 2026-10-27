export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong bg-sheet p-8 text-center">
      <h3 className="font-display text-[22px] leading-7 text-ink">{title}</h3>
      {body && <p className="mt-1.5 text-sm leading-5 text-ink-3">{body}</p>}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {body && <p className="mt-2 text-sm text-ink-muted">{body}</p>}
    </div>
  );
}
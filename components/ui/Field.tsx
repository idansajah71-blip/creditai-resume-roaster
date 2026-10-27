import React from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-3">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs leading-5 text-ink-3">{hint}</p>}
      {error && (
        <p className="text-xs font-medium leading-5 text-red-pen" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

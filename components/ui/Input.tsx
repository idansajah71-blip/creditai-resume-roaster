import React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      {...props}
    />
  );
}
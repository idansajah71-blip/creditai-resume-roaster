import React from "react";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      {...props}
    />
  );
}
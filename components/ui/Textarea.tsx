import React from "react";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="w-full rounded-[6px] border border-line-strong bg-paper-sunken px-3 py-2.5 text-base leading-6 text-ink placeholder:text-ink-3 md:text-[15px]"
      {...props}
    />
  );
}

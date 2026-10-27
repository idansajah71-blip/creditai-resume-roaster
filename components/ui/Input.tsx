import React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-[6px] border border-line-strong bg-paper-sunken px-3 py-2 text-base leading-6 text-ink placeholder:text-ink-3 md:min-h-[40px] md:text-[15px] min-h-[44px]"
      {...props}
    />
  );
}

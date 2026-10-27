import React from "react";

export function Label({ children, className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={`block text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-3 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

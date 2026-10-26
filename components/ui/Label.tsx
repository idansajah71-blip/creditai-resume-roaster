import React from "react";

export function Label({ children, className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`text-sm font-medium text-ink ${className}`} {...props}>
      {children}
    </label>
  );
}
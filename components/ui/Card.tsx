import React from "react";

export function Card({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}
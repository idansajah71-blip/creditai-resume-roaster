import React from "react";

/* A sheet is the editorial replacement for the old card: warm paper-white
   surface, 1px line border, 10px radius. Add "sheet-hero" via className on
   the one featured sheet of a page when a soft lift is wanted. */
export function Sheet({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}

import React from "react";

/* Signature editorial primitives for "The Red Pen".
   These carry meaning, not decoration:
   - Highlight: evidence / matches (highlighter over the words)
   - RedUnderline: problems and criticism (a red pen stroke)
   - MarginNote: roast lines, recommendations (editor's side comment)
   - Stamp: scores and statuses (stamped verdict)
   - Rule: a dashed hairline with an optional centered label */

export function Highlight({
  children,
  reveal = false,
  className = "",
}: {
  children: React.ReactNode;
  reveal?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline [box-decoration-break:clone] bg-no-repeat bg-[length:100%_58%] bg-[position:0_78%] bg-[linear-gradient(100deg,transparent_2%,var(--color-highlighter-soft)_7%,var(--color-highlighter)_98%)] px-[1px] ${reveal ? "hl-reveal" : ""} ${className}`}
      style={{ borderRadius: "6px 2px 8px 2px" }}
    >
      {children}
    </span>
  );
}

export function RedUnderline({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`red-underline ${className}`}>{children}</span>;
}

export function MarginNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`block border-l-2 border-red-pen pl-3 font-display italic text-ink-2 text-[17px] leading-[26px] ${className}`}
    >
      {children}
    </span>
  );
}

type StampTone = "red" | "ink";

export function Stamp({
  children,
  tone = "red",
  className = "",
}: {
  children: React.ReactNode;
  tone?: StampTone;
  className?: string;
}) {
  const border = tone === "ink" ? "border-ink text-ink" : "border-red-pen text-red-pen";
  return (
    <span
      className={`inline-block border-2 rounded-[6px] px-2.5 py-1 uppercase font-mono text-[11px] leading-[14px] tracking-[0.08em] -rotate-3 ${border} ${className}`}
    >
      {children}
    </span>
  );
}

export function Rule({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  if (label) {
    return (
      <div className={`relative flex items-center gap-3 ${className}`} role="separator">
        <span className="flex-1 border-t border-dashed border-line-strong" />
        <span className="type-label text-ink-3 uppercase">{label}</span>
        <span className="flex-1 border-t border-dashed border-line-strong" />
      </div>
    );
  }
  return <div className={`border-t border-dashed border-line-strong ${className}`} role="separator" />;
}

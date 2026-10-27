"use client";

import { useEffect, useRef, useState } from "react";

/* Thin ring, mono number centered; band color: <50 red-pen, 50-74 amber,
   >=75 green. Count-up runs 700ms and is skipped under reduced motion. */
export function ScoreRing({ score }: { score: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 1 : 700;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score]);

  const color = score >= 75 ? "#2F6B4F" : score >= 50 ? "#8A5A00" : "#C2331F";
  const r = 44;
  const c = 2 * Math.PI * r;
  const offset = c - (display / 100) * c;

  return (
    <svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      className="shrink-0"
      role="img"
      aria-label={`Match score ${score} out of 100`}
    >
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E2DAC8" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="600"
        fill="#17140F"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}
      >
        {display}
      </text>
    </svg>
  );
}

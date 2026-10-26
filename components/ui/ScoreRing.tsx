export function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#1B6B45" : score >= 50 ? "#8A5A00" : "#A8281B";
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E4E1D8" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize="20" fontWeight="600" fill="#14161A">
        {score}
      </text>
    </svg>
  );
}
export function formatCredits(n: number): string {
  return `${n} credit${n === 1 ? "" : "s"}`;
}
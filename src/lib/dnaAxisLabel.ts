/** Splits a long axis label into at most two lines, anchored away from the centre. */
export function splitAxisLabel(label: string, max = 12): string[] {
  if (label.length <= max || !label.includes(" ")) return [label];
  const words = label.split(" ");
  let best: [string, string] = [label, ""];
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const gap = Math.abs(a.length - b.length);
    if (gap < bestGap) {
      bestGap = gap;
      best = [a, b];
    }
  }
  return best[1] ? best : [label];
}

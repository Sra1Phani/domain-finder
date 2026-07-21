// App-side ordering of domain surfaces by TLD value (.com before .xyz), reusing
// core's tldWeight as the single source of TLD tiering. Used to sort a Check
// result's domain tiles so the most valuable TLD reads first.

import { tldWeight } from "@domain-finder/core";

/** Comparator: higher-tier TLD first; ties broken by shorter, then alphabetical. */
export function byTldValue(a: string, b: string): number {
  const byWeight = tldWeight(b) - tldWeight(a);
  if (byWeight !== 0) return byWeight;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

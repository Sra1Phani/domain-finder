// Shared string utilities: name normalization and a normalized similarity
// score. Used by the domain/namespace normalization and — via the package's
// subpath export — by the downstream (private) trademark-clearance package for
// wordmark similarity. Pure, dependency-free.

/**
 * Normalize a name for comparison and cache keys: lowercase, strip diacritics,
 * and drop everything that isn't a letter or digit (spaces, punctuation). So
 * "Açme, Inc." and "acme inc" both normalize toward their bare letters.
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two-row DP, O(min) memory.
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity in [0, 1] between two names, computed on their normalized forms
 * via edit distance: 1 = identical after normalization, 0 = maximally different.
 * Two empty-after-normalization inputs are treated as identical (1).
 */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return 1; // covers both-empty and exact-match
  if (x.length === 0 || y.length === 0) return 0;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

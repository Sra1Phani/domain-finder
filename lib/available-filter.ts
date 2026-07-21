// Pure view filter for the "Available only" toggle. Keeps only rows whose
// status is exactly "available" — never coerces unknown/parked/taken toward
// available. When on and nothing qualifies it returns [], which drives the
// empty state (and the auto-variations) rather than a blank panel.

export function filterAvailable<T extends { status: string }>(
  items: T[],
  availableOnly: boolean,
): T[] {
  return availableOnly ? items.filter((i) => i.status === "available") : items;
}

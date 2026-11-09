/**
 * Admin Listings: live listings stay in the main table; removed ones wait in a collapsed
 * section below. A listing removed on this visit stays in the main table so its "Removed"
 * result (and the focus that lands on it) doesn't jump away mid-action.
 */
export function splitListings<T extends { _id: string; removedAt?: number }>(
  tools: T[],
  removedThisVisit: ReadonlySet<string> = new Set(),
): { active: T[]; removed: T[] } {
  const active: T[] = [];
  const removed: T[] = [];
  for (const t of tools) (t.removedAt === undefined || removedThisVisit.has(t._id) ? active : removed).push(t);
  return { active, removed };
}

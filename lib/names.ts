/**
 * Names are shown as first name + last initial ("Ben Carter" -> "Ben C."), so the board
 * never prints anyone's full name. Works for "Ben Carter", "Ben C." and "Ben C" alike;
 * single names stay as they are.
 */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Neighbor";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** "Ben Carter" -> "Ben", for sentences like "Send request to Ben". */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "your neighbor";
}

export function initial(full: string): string {
  return (full.trim().charAt(0) || "?").toUpperCase();
}

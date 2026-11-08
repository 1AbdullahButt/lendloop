// What other people's personal data may look like when it leaves Convex. Every query sends
// other users' names as first name + last initial and never an email; admins get a masked
// email only. Dependency-free, so the browser's lib/names.ts and these stay testable together.

/**
 * "Ben Carter" -> "Ben C." (single names stay as they are). Same rule as lib/names.ts
 * shortName; tests/unit/projections.test.ts keeps the two in step.
 */
export function displayName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Neighbor";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** "ben@example.com" -> "b***@example.com": enough for an admin to recognize an account. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "no email";
  return `${email.charAt(0)}***${email.slice(at)}`;
}

import { shortName } from "@/lib/names";

/** Yellow tag after a lender's name (signed-in views only, SPEC 5). */
export function TrustedBadge({ compact = false }: { compact?: boolean }) {
  return (
    // Uppercase via CSS, so screen readers say "Trusted Lender" as words.
    <span className="mono rounded bg-sun px-1.5 text-xs font-semibold tracking-wide text-ink uppercase" title="Trusted Lender">
      {compact ? "Trusted" : "Trusted Lender"}
    </span>
  );
}

/** First name + last initial, with the Trusted Lender tag when it applies. */
export function PersonName({ name, trusted }: { name: string; trusted?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>{shortName(name)}</span>
      {trusted ? <TrustedBadge /> : null}
    </span>
  );
}

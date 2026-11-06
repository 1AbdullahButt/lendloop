const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  on_loan: "bg-amber-50 text-amber-800 ring-amber-200",
  pending: "bg-sky-50 text-sky-800 ring-sky-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-stone-100 text-stone-700 ring-stone-200",
  cancelled: "bg-stone-100 text-stone-700 ring-stone-200",
  returned: "bg-stone-100 text-stone-700 ring-stone-200",
  queued: "bg-sky-50 text-sky-800 ring-sky-200",
  sent: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-red-50 text-red-800 ring-red-200",
  removed: "bg-red-50 text-red-800 ring-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  on_loan: "On loan",
};

function label(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-700 ring-stone-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {label(status)}
    </span>
  );
}

/** Small badge next to a lender's display name (signed-in views only, SPEC 5). */
export function TrustedBadge() {
  return (
    <span
      title="Trusted Lender"
      className="ml-1.5 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200"
    >
      <span aria-hidden="true" className="mr-1">
        ★
      </span>
      Trusted Lender
    </span>
  );
}

export function PersonName({ name, trusted }: { name: string; trusted?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center">
      <span>{name}</span>
      {trusted ? <TrustedBadge /> : null}
    </span>
  );
}

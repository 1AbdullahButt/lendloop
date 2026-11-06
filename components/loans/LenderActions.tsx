"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { todayUtc } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { Button } from "../ui/Button";
import { InlineError } from "../ui/States";

type Props = { loanId: Id<"loans">; status: string; toolName: string; startDate: string };

/** Approve / decline a pending request, or mark an approved loan returned. Convex checks the caller is the lender. */
export function LenderActions({ loanId, status, toolName, startDate }: Props) {
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const markReturned = useAction(useMutation(api.loans.markReturned));
  const busy = approve.pending || decline.pending || markReturned.pending;
  const error = approve.error ?? decline.error ?? markReturned.error;
  // Mirrors the server rule so the lender sees why before clicking; Convex still enforces it.
  const stale = status === "pending" && startDate < todayUtc();

  if (status !== "pending" && status !== "approved") return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <Button
              variant="primary"
              disabled={busy || stale}
              onClick={() => void approve.run({ loanId })}
              aria-label={`Approve request for ${toolName}`}
            >
              {approve.pending ? "Approving…" : "Approve"}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void decline.run({ loanId })}
              aria-label={`Decline request for ${toolName}`}
            >
              {decline.pending ? "Declining…" : "Decline"}
            </Button>
          </>
        ) : (
          <Button
            disabled={busy}
            onClick={() => void markReturned.run({ loanId })}
            aria-label={`Mark ${toolName} returned`}
          >
            {markReturned.pending ? "Saving…" : "Mark returned"}
          </Button>
        )}
      </div>
      {stale ? (
        <p className="mt-2 text-sm text-stone-600">
          The start date has passed, so this request can only be declined.
        </p>
      ) : null}
      <InlineError message={error} />
    </div>
  );
}

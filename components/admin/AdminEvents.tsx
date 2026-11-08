"use client";

import { useMutation } from "convex/react";
import { useId, useRef, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { splitFailures } from "@/lib/adminEvents";
import { formatDateTime } from "@/lib/dates";
import { isCurrentEmail } from "@/lib/loanEmail";
import { datesOverlap } from "@/convex/lib/clash";
import { shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { useTimeZone } from "../TimeZone";
import { Button } from "../ui/Button";
import { loanStatusLabel, Stamp } from "../ui/Stamp";
import { EmptyState, InlineError } from "../ui/States";
import { AdminSection, AdminTable } from "./AdminTable";

export type AdminEvent = FunctionReturnType<typeof api.admin.listAutomationEvents>[number];
export type AdminLoan = FunctionReturnType<typeof api.admin.listAllLoans>[number];

/** Mirrors convex/automation.ts MAX_ATTEMPTS (1 send + 3 retries); display only. */
const MAX_ATTEMPTS = 4;

const TYPE_LABEL: Record<string, string> = {
  "loan.requested": "New request",
  "loan.approved": "Approved",
  "loan.declined": "Declined",
  "loan.returned": "Returned",
  "loan.cancelled": "Canceled",
  "loan.dates_taken": "Dates taken",
};

/** Convex parses the idempotency key and sends only the type, so keys never reach the browser. */
function eventType(event: AdminEvent): string | null {
  return event.type;
}

function blockerId(event: AdminEvent): string | null {
  return event.blockerLoanId;
}

export function emailLabel(event: AdminEvent): string {
  if (event.kind === "overdue_reminder") return "Overdue reminder";
  return TYPE_LABEL[eventType(event) ?? ""] ?? "Notification";
}

/** Same rule as convex/automation.ts recipientSide: the party who did not act. */
function recipient(event: AdminEvent, loan: AdminLoan | undefined): string {
  if (!loan) return "—";
  const type = eventType(event);
  const toLender = type === "loan.requested" || (type === "loan.cancelled" && loan.decidedAt === undefined);
  return shortName(toLender ? loan.lenderName : loan.borrowerName);
}

/** Turns the stored lastError into a next step for the admin. */
function failureHint(lastError: string | undefined): string {
  if (!lastError) return "No error text was recorded.";
  if (/network error/i.test(lastError)) return "n8n couldn't be reached. Check the tunnel address.";
  if (/not configured/i.test(lastError)) return "The webhook URL or signing secret isn't set in Convex.";
  const http = /HTTP (\d{3})/.exec(lastError);
  if (http) return `n8n answered ${http[1]}. Check the workflow's executions.`;
  if (/missing/i.test(lastError)) return "The loan, tool or recipient is gone, so a resend will fail too.";
  return lastError;
}

function StatusCell({
  event,
  loan,
  blocker,
  resentHere,
  onResent,
}: {
  event: AdminEvent;
  loan: AdminLoan | undefined;
  /** For "dates taken": the approved loan that took the dates. */
  blocker: AdminLoan | undefined;
  resentHere: boolean;
  onResent: () => void;
}) {
  const resend = useAction(useMutation(api.admin.resendEvent));
  // The Resend button disappears once the email is queued, so focus moves to this cell
  // instead of falling back to the page.
  const cellRef = useRef<HTMLDivElement>(null);
  let body: ReactNode;
  if (event.status === "sent") {
    body = (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Stamp tone="approved" size="sm" press={resentHere}>
          Sent
        </Stamp>
        {resentHere ? <span className="text-sm text-ink-2">Resent just now</span> : null}
      </span>
    );
  } else if (event.status === "queued") {
    body = (
      <Stamp tone="pending" size="sm">
        Sending
      </Stamp>
    );
  } else {
    const hint = failureHint(event.lastError);
    const stillBlocked = Boolean(loan && blocker?.status === "approved" && datesOverlap(blocker, loan));
    const current = loan ? isCurrentEmail(eventType(event), loan.status, stillBlocked) : false;
    const staleWhy =
      loan && blockerId(event) && loan.status === "pending"
        ? "those dates are free again"
        : `the request is now ${loan ? loanStatusLabel(loan.status).toLowerCase() : "gone"}`;
    body = (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Stamp tone="failed" size="sm">
            Failed
          </Stamp>
          <span className="text-sm text-brick-dark">{hint}</span>
          {event.kind !== "request_notification" ? (
            <span className="text-sm text-ink-2">The daily workflow tries again tomorrow.</span>
          ) : current ? (
            <Button
              size="sm"
              disabled={resend.pending}
              onClick={async () => {
                if (await resend.run({ eventId: event._id })) {
                  onResent();
                  cellRef.current?.focus();
                }
              }}
              aria-label={`Resend the ${emailLabel(event).toLowerCase()} email for ${loan?.toolName ?? "this loan"}`}
            >
              {resend.pending ? "Resending…" : "Resend"}
            </Button>
          ) : (
            <span className="text-sm text-ink-2">
              Out of date: {staleWhy}, so there&apos;s nothing to resend.
            </span>
          )}
        </div>
        {/* The stored text is already redacted (no secret or webhook URL) and capped. */}
        {event.lastError && event.lastError !== hint ? (
          <span className="mono text-xs break-all text-ink-3">{event.lastError}</span>
        ) : null}
        <InlineError message={resend.error} />
      </div>
    );
  }
  return (
    <div ref={cellRef} tabIndex={-1} role="status" className="rounded">
      {body}
    </div>
  );
}

/** Outbound + reminder log. Failed rows are tinted and can be resent (AC17). */
export function AdminEvents({ events, loans }: { events: AdminEvent[]; loans: Map<string, AdminLoan> }) {
  const zone = useTimeZone();
  const filterId = useId();
  const [failedOnly, setFailedOnly] = useState(false);
  const [resent, setResent] = useState<Record<string, true>>({});
  // Failures the loan has moved past can't be resent, so they wait collapsed below the table
  // instead of crowding the ones an admin can act on. Nothing is deleted.
  const { active, older } = splitFailures(events, loans);
  // A row resent on this visit stays in the "failed only" view, so its new status shows and
  // focus has a cell to land on.
  const shown = failedOnly ? active.filter((e) => e.status === "failed" || resent[e._id]) : active;
  const rows = (list: AdminEvent[]) =>
    list.map((event) => {
      const loan = loans.get(event.loanId);
      return (
        <tr key={event._id} className={event.status === "failed" ? "bg-[#FCF1EF]" : undefined}>
          <td className="num">{formatDateTime(event.createdAt, zone)}</td>
          <td>{emailLabel(event)}</td>
          <td>{loan?.toolName ?? "—"}</td>
          <td>{recipient(event, loan)}</td>
          <td className="num">
            {event.attempts <= MAX_ATTEMPTS ? `${event.attempts} of ${MAX_ATTEMPTS}` : event.attempts}
          </td>
          <td>
            <StatusCell
              event={event}
              loan={loan}
              blocker={blockerId(event) ? loans.get(blockerId(event)!) : undefined}
              resentHere={Boolean(resent[event._id])}
              onResent={() => setResent((s) => ({ ...s, [event._id as Id<"automationEvents">]: true }))}
            />
          </td>
        </tr>
      );
    });
  const headers = ["When", "Email", "Tool", "Sent to", "Tries", "Status"];
  return (
    <AdminSection
      id="emails"
      title="Automated emails"
      note="Each one is signed and sent to n8n. A failed send is tried 3 more times (after 30 sec, 2 min, 10 min) before it shows here as failed."
    >
      <label htmlFor={filterId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-[15px]">
        <input
          id={filterId}
          type="checkbox"
          checked={failedOnly}
          onChange={(e) => setFailedOnly(e.target.checked)}
          className="h-4.5 w-4.5 accent-pine"
        />
        Show failed only
      </label>
      {shown.length === 0 ? (
        <EmptyState title={failedOnly ? "No failed emails to act on" : "No automated emails yet"} />
      ) : (
        <AdminTable caption="Automated emails, newest first" headers={headers}>
          {rows(shown)}
        </AdminTable>
      )}
      {older.length > 0 ? (
        <details className="rounded-xl border-2 border-line-soft bg-white px-4 py-3">
          <summary className="min-h-11 cursor-pointer content-center font-bold text-ink-2">
            Older failures ({older.length})
          </summary>
          <p className="mt-1 mb-3 text-sm text-ink-2">
            The loan has moved on since these failed, so there is nothing to resend. Kept for the record.
          </p>
          <AdminTable caption="Older failed emails, newest first" headers={headers}>
            {rows(older)}
          </AdminTable>
        </details>
      ) : null}
    </AdminSection>
  );
}

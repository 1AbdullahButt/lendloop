"use client";

import { useMutation, useQuery } from "convex/react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { askedLabel, dateLine, daysOverdue, formatDate, formatDateRange, formatDayLong, todayIn } from "@/lib/dates";
import { clashCalendar, type ClashCalendar } from "@/lib/clashCalendar";
import { newlyBlocked } from "@/convex/lib/clash";
import { verdictNote } from "@/lib/loanText";
import { firstName, shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { useNow } from "@/lib/useNow";
import { useTimeZone } from "../TimeZone";
import { TrustedBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { QueryBoundary } from "../ui/QueryBoundary";
import { OverdueTag, Stamp } from "../ui/Stamp";
import { EmptyState, InlineError, LoadingState, Notice } from "../ui/States";

type Loan = FunctionReturnType<typeof api.loans.listIncoming>[number];

function overlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

function overlapRange(a: Loan, b: Loan) {
  const from = a.startDate > b.startDate ? a.startDate : b.startDate;
  const to = a.endDate < b.endDate ? a.endDate : b.endDate;
  return formatDateRange(from, to);
}

/** Why Approve is off, mirroring convex/loans.ts (the server re-checks both rules). */
function blockedReason(loan: Loan, all: Loan[], today: string): string | null {
  const first = firstName(loan.borrowerName);
  if (loan.startDate < today) {
    return `${first}'s start date (${formatDate(loan.startDate)}) has passed, so it can't be approved. Decline it and ${first} can ask again with new dates.`;
  }
  const clash = all.find((o) => o._id !== loan._id && o.toolId === loan.toolId && o.status === "approved" && overlaps(o, loan));
  if (clash) return `Clashes with ${firstName(clash.borrowerName)}'s approved loan on ${overlapRange(clash, loan)}.`;
  return null;
}

/**
 * Mini calendar, only when requests on a tool clash (lib/clashCalendar.ts): one cell per day
 * with its number, the month where it starts or changes, a row per person, approved as a solid
 * bar, waiting as an outlined bar, and the clashing days hatched. Wider than the screen, it
 * scrolls sideways inside its box.
 */
function ClashCal({ tool, cal, today }: { tool: string; cal: ClashCalendar<Loan>; today: string }) {
  const clashDays = cal.days.filter((_, i) => cal.rows.some((r) => r.clash[i])).map((d) => formatDate(d.iso));
  const label = `${tool} calendar: ${cal.rows
    .map((r) => `${shortName(r.req.borrowerName)} ${formatDateRange(r.req.startDate, r.req.endDate)}, ${r.req.status === "approved" ? "approved" : "waiting"}`)
    .join("; ")}. Clashing days: ${clashDays.join(", ")}.${cal.days.some((d) => d.today) ? ` Today is ${formatDate(today)}.` : ""}`;
  const cols = { gridTemplateColumns: `minmax(64px, max-content) repeat(${cal.days.length}, minmax(40px, 1fr))` };
  return (
    <div className="flex flex-col gap-2">
      <div className="cc-scroll" role="img" aria-label={label}>
        <div className="cc-grid" style={cols} aria-hidden="true">
          <span />
          {cal.days.map((d) => (
            <span key={`t${d.iso}`} className="cc-today">
              {d.today ? "TODAY" : ""}
            </span>
          ))}
          <span />
          {cal.days.map((d) => (
            <span key={`m${d.iso}`} className="cc-month">
              {d.month ?? ""}
            </span>
          ))}
          <span />
          {cal.days.map((d) => (
            <span key={`d${d.iso}`} className={`cc-day${d.today ? " cc-day-today" : ""}`}>
              {d.day}
            </span>
          ))}
          {cal.rows.map((r) => (
            <Fragment key={r.req._id}>
              <span className="cc-name">{firstName(r.req.borrowerName)}</span>
              {cal.days.map((d, i) => {
                const inside = i >= r.from && i <= r.to;
                const cls = [
                  "cc-cell",
                  inside ? (r.req.status === "approved" ? "cc-approved" : "cc-waiting") : "",
                  inside && i === r.from ? "cc-start" : "",
                  inside && i === r.to ? "cc-end" : "",
                  r.clash[i] ? "cc-clash" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return <span key={d.iso} className={cls} />;
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="cc-legend" aria-hidden="true">
        <span>
          <i className="cc-swatch cc-approved" /> Approved
        </span>
        <span>
          <i className="cc-swatch cc-waiting" /> Waiting
        </span>
        <span>
          <i className="cc-swatch cc-clash" /> Clash
        </span>
      </div>
    </div>
  );
}

function RequestRow({
  loan,
  all,
  today,
  now,
  onDecided,
}: {
  loan: Loan;
  all: Loan[];
  today: string;
  now: number;
  onDecided: (note: string) => void;
}) {
  const zone = useTimeZone();
  const [confirming, setConfirming] = useState(false);
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const busy = approve.pending || decline.pending;
  const who = shortName(loan.borrowerName);
  const first = firstName(loan.borrowerName);
  const why = blockedReason(loan, all, today);
  const whyId = `why-${loan._id}`;
  const line = dateLine(loan.startDate, loan.endDate);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 border-t border-mist py-4 max-[640px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-bold">
          {who}
          {loan.borrowerTrusted ? <TrustedBadge compact /> : null}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-lg font-extrabold">{line.dates}</span>
          <span className="mono text-sm text-ink-2">· {line.days}</span>
        </span>
        <span className="text-sm text-ink-2">{askedLabel(loan.createdAt, now, zone)}</span>
        {why ? (
          <span id={whyId} className="text-sm text-brick">
            {why}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5 max-[640px]:justify-start">
        {confirming ? (
          <>
            <span className="text-sm">Decline {first}? They&apos;ll get an email.</span>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await decline.run({ loanId: loan._id })) {
                  onDecided(`Declined ${who}'s request for ${loan.toolName}. ${verdictNote("declined", first, [])}`);
                }
              }}
            >
              {decline.pending ? "Declining…" : "Yes, decline"}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => setConfirming(true)} aria-label={`Decline ${who}'s request for ${loan.toolName}`}>
              Decline
            </Button>
            <Button
              variant="primary"
              disabled={busy || why !== null}
              aria-describedby={why ? whyId : undefined}
              onClick={async () => {
                // Who this approval's "dates taken" email goes to, by the server's own rule.
                const onTool = all.filter((o) => o.toolId === loan.toolId);
                const told = newlyBlocked(loan, onTool, today).map((o) => firstName(o.borrowerName));
                if (await approve.run({ loanId: loan._id })) {
                  onDecided(
                    `Approved ${who}'s request for ${loan.toolName} (${formatDateRange(loan.startDate, loan.endDate)}). ${verdictNote("approved", first, told)}`,
                  );
                }
              }}
              aria-label={`Approve ${who}'s request for ${loan.toolName}`}
            >
              {approve.pending ? "Approving…" : "Approve"}
            </Button>
          </>
        )}
        <InlineError message={approve.error ?? decline.error} />
      </div>
    </div>
  );
}

/** One tool with requests still waiting; approved loans live under "Out on loan". */
function ToolGroup({
  toolName,
  waiting,
  all,
  today,
  now,
  onDecided,
}: {
  toolName: string;
  waiting: Loan[];
  all: Loan[];
  today: string;
  now: number;
  onDecided: (note: string) => void;
}) {
  const toolId = waiting[0].toolId;
  const approvedOnTool = all.filter((l) => l.toolId === toolId && l.status === "approved");
  const cal = clashCalendar([...approvedOnTool, ...waiting], today);
  const pair = waiting.flatMap((a, i) => waiting.slice(i + 1).filter((b) => overlaps(a, b)).map((b) => [a, b] as const))[0];
  const headingId = `group-${toolId}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5 rounded-2xl border border-line-soft bg-white px-5.5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="font-display text-2xl font-extrabold" style={{ fontStretch: "108%" }}>
          {toolName}
        </h2>
        <span className="text-sm text-ink-2">
          {waiting.length} {waiting.length === 1 ? "request" : "requests"} waiting
        </span>
      </div>
      {pair ? (
        <Notice tone="warn">
          {firstName(pair[0].borrowerName)} and {firstName(pair[1].borrowerName)} overlap on {overlapRange(pair[0], pair[1])}.
          Approving one will block the other, and we&apos;ll let them know.
        </Notice>
      ) : null}
      {cal ? <ClashCal tool={toolName} cal={cal} today={today} /> : null}
      <div>
        {waiting.map((loan) => (
          <RequestRow key={loan._id} loan={loan} all={all} today={today} now={now} onDecided={onDecided} />
        ))}
      </div>
    </section>
  );
}

function OutOnLoan({ loan, today, returnedHere, onReturned }: { loan: Loan; today: string; returnedHere: boolean; onReturned: () => void }) {
  const markReturned = useAction(useMutation(api.loans.markReturned));
  const first = firstName(loan.borrowerName);
  const late = loan.status === "approved" ? daysOverdue(loan.endDate, today) : 0;
  const stampId = `returned-${loan._id}`;
  useEffect(() => {
    if (returnedHere) document.getElementById(stampId)?.focus();
  }, [returnedHere, stampId]);

  let note: string;
  if (returnedHere) note = "Back on the board and available to borrow.";
  else if (late > 0) note = `Was due ${formatDate(loan.endDate)}. ${first} gets a reminder each morning until you mark it returned.`;
  else if (loan.startDate > today) note = `Starts ${formatDate(loan.startDate)}. Due back ${formatDate(loan.endDate)}.`;
  else note = `Due back ${formatDate(loan.endDate)}.`;

  return (
    <section
      aria-label={`${loan.toolName} with ${shortName(loan.borrowerName)}`}
      className="flex flex-wrap items-center gap-x-5 gap-y-3.5 rounded-2xl border-2 border-ink bg-white px-5.5 py-5"
    >
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
        <span className="font-display text-[22px] font-extrabold" style={{ fontStretch: "108%" }}>
          {loan.toolName}
        </span>
        <span className="font-bold">
          {shortName(loan.borrowerName)} · {formatDateRange(loan.startDate, loan.endDate)}
        </span>
        <span className="text-sm text-ink-2">{note}</span>
      </div>
      <div role="status" className="flex flex-wrap items-center gap-2.5">
        {returnedHere ? (
          <Stamp id={stampId} tone="returned" size="lg" tilt={-3} press>
            Returned · {formatDate(today)}
          </Stamp>
        ) : (
          <>
            <Stamp tone="approved">Approved</Stamp>
            {late > 0 ? <OverdueTag days={late} /> : null}
            <Button
              variant="primary"
              disabled={markReturned.pending}
              onClick={async () => {
                if (await markReturned.run({ loanId: loan._id })) onReturned();
              }}
              aria-label={`Mark ${loan.toolName} returned`}
            >
              {markReturned.pending ? "Saving…" : "Mark returned"}
            </Button>
          </>
        )}
        <InlineError message={markReturned.error} />
      </div>
    </section>
  );
}

function IncomingBody() {
  const loans = useQuery(api.loans.listIncoming);
  const now = useNow();
  const zone = useTimeZone();
  const today = todayIn(zone, now);
  // The last approve or decline on this visit, said once at the top: who was emailed, and
  // anyone whose dates it took. The decided request itself leaves the waiting list.
  const [note, setNote] = useState<{ text: string; n: number } | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (note) noteRef.current?.focus();
  }, [note]);
  const [returned, setReturned] = useState<Record<string, true>>({});

  return (
    <>
      <PageHeader title="Incoming requests">
        Neighbors asking to borrow your tools, grouped by tool. Today is {formatDayLong(today)} · {zone.replace(/_/g, " ")}.
      </PageHeader>
      <div ref={noteRef} tabIndex={-1} role="status" className="rounded-md outline-none">
        {note ? (
          <p key={note.n} className="rounded-md border border-pine bg-[#E7F2EC] px-4 py-3 text-[15px] text-pine-ink">
            {note.text}
          </p>
        ) : null}
      </div>
      {loans === undefined ? (
        <LoadingState label="Loading incoming requests…" />
      ) : (
        <IncomingLists
          loans={loans}
          today={today}
          now={now}
          returned={returned}
          onDecided={(text) => setNote((prev) => ({ text, n: (prev?.n ?? 0) + 1 }))}
          onReturned={(id) => setReturned((s) => ({ ...s, [id]: true }))}
        />
      )}
    </>
  );
}

function IncomingLists({
  loans,
  today,
  now,
  returned,
  onDecided,
  onReturned,
}: {
  loans: Loan[];
  today: string;
  now: number;
  returned: Record<string, true>;
  onDecided: (note: string) => void;
  onReturned: (id: Id<"loans">) => void;
}) {
  const groups = new Map<string, Loan[]>();
  for (const l of loans.filter((x) => x.status === "pending")) groups.set(l.toolId, [...(groups.get(l.toolId) ?? []), l]);
  for (const reqs of groups.values()) reqs.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const out = loans
    .filter((l) => l.status === "approved" || returned[l._id])
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (groups.size === 0 && out.length === 0) {
    return (
      <EmptyState title="No requests right now">
        When a neighbor asks to borrow one of your tools, it shows up here with its dates.
      </EmptyState>
    );
  }
  return (
    <>
      {groups.size === 0 ? <p className="text-ink-2">No requests are waiting for an answer.</p> : null}
      {[...groups.values()].map((waiting) => (
        <ToolGroup
          key={waiting[0].toolId}
          toolName={waiting[0].toolName}
          waiting={waiting}
          all={loans}
          today={today}
          now={now}
          onDecided={onDecided}
        />
      ))}
      {out.length > 0 ? (
        <>
          <h2 className="mt-3 font-display text-[26px] font-extrabold">Out on loan</h2>
          {out.map((loan) => (
            <OutOnLoan
              key={loan._id}
              loan={loan}
              today={today}
              returnedHere={Boolean(returned[loan._id])}
              onReturned={() => onReturned(loan._id)}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

export function IncomingRequests() {
  return (
    <QueryBoundary>
      <IncomingBody />
    </QueryBoundary>
  );
}

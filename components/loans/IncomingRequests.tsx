"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, daysBetween, daysOverdue, formatDate, formatDateRange, formatDayLong, todayUtc } from "@/lib/dates";
import { firstName, shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { useNow } from "@/lib/useNow";
import { TrustedBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { QueryBoundary } from "../ui/QueryBoundary";
import { OverdueTag, Stamp } from "../ui/Stamp";
import { EmptyState, InlineError, LoadingState, Notice } from "../ui/States";

type Loan = FunctionReturnType<typeof api.loans.listIncoming>[number];
type Verdict = "approved" | "declined";

function overlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

function overlapRange(a: Loan, b: Loan) {
  const from = a.startDate > b.startDate ? a.startDate : b.startDate;
  const to = a.endDate < b.endDate ? a.endDate : b.endDate;
  return formatDateRange(from, to);
}

function askedLabel(createdAt: number, now: number): string {
  const day = (ms: number) => new Date(ms).toDateString();
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(createdAt);
  if (day(createdAt) === day(now)) return `Asked today, ${time}`;
  if (day(createdAt) === day(now - 86_400_000)) return "Asked yesterday";
  return `Asked ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(createdAt)}`;
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

/** Day strip for one tool: each request (and approved loan) as a bar, with today marked. */
function Calendar({ tool, rows, today }: { tool: string; rows: Loan[]; today: string }) {
  const lo = [today, ...rows.map((r) => r.startDate)].sort()[0];
  const hi = rows.map((r) => r.endDate).sort().slice(-1)[0] ?? today;
  const start = addDays(lo, -1);
  const span = Math.max(14, daysBetween(start, hi) + 2);
  const end = addDays(start, span - 1);
  const pos = (d: string) => (daysBetween(start, d) / span) * 100;
  const todayLeft = pos(today) + 100 / span / 2;
  const label = `${tool} calendar: ${rows
    .map((r) => `${shortName(r.borrowerName)} ${formatDateRange(r.startDate, r.endDate)}, ${r.status}`)
    .join("; ")}. Today is ${formatDate(today)}.`;
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const look =
          r.status === "approved"
            ? { fill: "#1F6B4E", line: "#1F6B4E", style: "solid" }
            : r.status === "declined"
              ? { fill: "transparent", line: "#8A2A1E", style: "dashed" }
              : { fill: "#F5C518", line: "#6B4E00", style: "solid" };
        return (
          <div key={r._id} className="track-row">
            <span className="truncate text-sm font-bold">{firstName(r.borrowerName)}</span>
            <div className="relative h-[26px] rounded-md bg-paper">
              <div
                className="absolute top-[3px] bottom-[3px] rounded"
                style={{
                  left: `${pos(r.startDate)}%`,
                  width: `${((daysBetween(r.startDate, r.endDate) + 1) / span) * 100}%`,
                  background: look.fill,
                  border: `2px ${look.style} ${look.line}`,
                }}
              />
              <div className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-ink" style={{ left: `${todayLeft}%` }} aria-hidden="true" />
            </div>
          </div>
        );
      })}
      <div className="track-row" aria-hidden="true">
        <span />
        <div className="mono relative h-4 text-xs text-ink-2">
          <span className="absolute left-0">{formatDate(start).toUpperCase()}</span>
          <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: `${todayLeft}%` }}>
            TODAY
          </span>
          <span className="absolute right-0">{formatDate(end).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

function RequestRow({
  loan,
  all,
  today,
  now,
  verdict,
  onDecided,
}: {
  loan: Loan;
  all: Loan[];
  today: string;
  now: number;
  verdict?: Verdict;
  onDecided: (id: Id<"loans">, v: Verdict) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const approve = useAction(useMutation(api.loans.approve));
  const decline = useAction(useMutation(api.loans.decline));
  const busy = approve.pending || decline.pending;
  const who = shortName(loan.borrowerName);
  const first = firstName(loan.borrowerName);
  const why = loan.status === "pending" ? blockedReason(loan, all, today) : null;
  const whyId = `why-${loan._id}`;
  const stampId = `stamp-${loan._id}`;
  const days = daysBetween(loan.startDate, loan.endDate) + 1;

  useEffect(() => {
    if (verdict) document.getElementById(stampId)?.focus();
  }, [verdict, stampId]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 border-t border-mist py-4 max-[640px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
          {who} · {formatDateRange(loan.startDate, loan.endDate)}
          {loan.borrowerTrusted ? <TrustedBadge compact /> : null}
        </span>
        <span className="text-sm text-ink-2">
          {days} {days === 1 ? "day" : "days"} · {askedLabel(loan.createdAt, now)}
        </span>
        {why ? (
          <span id={whyId} className="text-sm text-brick">
            {why}
          </span>
        ) : null}
      </div>
      <div role="status" className="flex flex-wrap items-center justify-end gap-2.5 max-[640px]:justify-start">
        {verdict ? (
          <>
            <Stamp id={stampId} tone={verdict} size="lg" tilt={-3} press>
              {verdict}
            </Stamp>
            <span className="text-sm text-ink-2">{first} will get an email.</span>
          </>
        ) : loan.status !== "pending" ? null : confirming ? (
          <>
            <span className="text-sm">Decline {first}? They&apos;ll get an email.</span>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await decline.run({ loanId: loan._id })) onDecided(loan._id, "declined");
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
                if (await approve.run({ loanId: loan._id })) onDecided(loan._id, "approved");
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

function ToolGroup({
  toolName,
  reqs,
  all,
  today,
  now,
  verdicts,
  onDecided,
}: {
  toolName: string;
  reqs: Loan[];
  all: Loan[];
  today: string;
  now: number;
  verdicts: Record<string, Verdict>;
  onDecided: (id: Id<"loans">, v: Verdict) => void;
}) {
  const waiting = reqs.filter((r) => r.status === "pending");
  const approvedOnTool = all.filter((l) => l.toolId === reqs[0].toolId && l.status === "approved" && !reqs.includes(l));
  const pair = waiting.flatMap((a, i) => waiting.slice(i + 1).filter((b) => overlaps(a, b)).map((b) => [a, b] as const))[0];
  const headingId = `group-${reqs[0].toolId}`;
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
          Approving one will block the other.
        </Notice>
      ) : null}
      <Calendar tool={toolName} rows={[...approvedOnTool, ...reqs]} today={today} />
      <div>
        {reqs.map((loan) => (
          <RequestRow
            key={loan._id}
            loan={loan}
            all={all}
            today={today}
            now={now}
            verdict={verdicts[loan._id]}
            onDecided={onDecided}
          />
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
  const today = todayUtc(now);
  // Decisions made on this visit keep their stamp in place instead of vanishing from the list.
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [returned, setReturned] = useState<Record<string, true>>({});

  return (
    <>
      <PageHeader title="Incoming requests">
        Neighbors asking to borrow your tools, grouped by tool. Today is {formatDayLong(today)}.
      </PageHeader>
      {loans === undefined ? (
        <LoadingState label="Loading incoming requests…" />
      ) : (
        <IncomingLists
          loans={loans}
          today={today}
          now={now}
          verdicts={verdicts}
          returned={returned}
          onDecided={(id, v) => setVerdicts((s) => ({ ...s, [id]: v }))}
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
  verdicts,
  returned,
  onDecided,
  onReturned,
}: {
  loans: Loan[];
  today: string;
  now: number;
  verdicts: Record<string, Verdict>;
  returned: Record<string, true>;
  onDecided: (id: Id<"loans">, v: Verdict) => void;
  onReturned: (id: Id<"loans">) => void;
}) {
  const inGroups = loans.filter((l) => l.status === "pending" || verdicts[l._id]);
  const groups = new Map<string, Loan[]>();
  for (const l of inGroups) groups.set(l.toolId, [...(groups.get(l.toolId) ?? []), l]);
  for (const reqs of groups.values()) reqs.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const out = loans
    .filter((l) => l.status === "approved" || returned[l._id])
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (groups.size === 0 && out.length === 0) {
    return (
      <EmptyState title="No requests right now">
        When a neighbor asks to borrow one of your tools, it shows up here with a calendar of the dates.
      </EmptyState>
    );
  }
  return (
    <>
      {groups.size === 0 ? <p className="text-ink-2">No requests are waiting for an answer.</p> : null}
      {[...groups.values()].map((reqs) => (
        <ToolGroup
          key={reqs[0].toolId}
          toolName={reqs[0].toolName}
          reqs={reqs}
          all={loans}
          today={today}
          now={now}
          verdicts={verdicts}
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

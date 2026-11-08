"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { daysOverdue, formatDate, formatDateRange, formatDateTime, todayIn } from "@/lib/dates";
import { buildLedger, type LedgerTag } from "@/lib/ledger";
import { isCurrentEmail } from "@/lib/loanEmail";
import { borrowerNextStep } from "@/lib/loanText";
import { firstName, shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { useNow } from "@/lib/useNow";
import { useTimeZone } from "../TimeZone";
import { TrustedBadge } from "../ui/Badges";
import { Button, buttonClass } from "../ui/Button";
import { QueryBoundary } from "../ui/QueryBoundary";
import { LoanStamp, OverdueTag } from "../ui/Stamp";
import { EmptyState, InlineError, LoadingState, Notice } from "../ui/States";

type MyLoan = FunctionReturnType<typeof api.loans.listMine>[number];
type Tab = "all" | "waiting" | "out" | "past";

const TAG_LOOK: Record<LedgerTag, { label: string; bg: string; fg: string }> = {
  you: { label: "YOU", bg: "#E3E8EE", fg: "#2E4257" },
  lender: { label: "LENDER", bg: "#ECEDEA", fg: "#15201B" },
  board: { label: "BOARD", bg: "#ECEDEA", fg: "#15201B" },
  email: { label: "EMAIL", bg: "#DDEFE5", fg: "#145233" },
  sending: { label: "SENDING", bg: "#FFF1C2", fg: "#4A3600" },
  reminder: { label: "REMINDER", bg: "#FFF1C2", fg: "#4A3600" },
  failed: { label: "FAILED", bg: "#F6DEDA", fg: "#6E2017" },
};

function groupOf(loan: MyLoan): Exclude<Tab, "all"> {
  if (loan.status === "pending") return "waiting";
  if (loan.status === "approved") return "out";
  return "past";
}

/** Shown when `emailStatus` is failed (the server's view of every notification on the loan) and that email is still current. */
function FailedEmail({ loan }: { loan: MyLoan }) {
  const lender = firstName(loan.lenderName);
  // Only an email that still describes the loan can be resent; an older failure (say, the
  // "new request" email after approval) stays as a FAILED line in the Activity ledger.
  const failed = loan.activity.find(
    (a) => a.kind === "request_notification" && a.status === "failed" && isCurrentEmail(a.type, loan.status, loan.datesTaken != null),
  );
  if (!failed) return null;
  let text: string;
  if (failed.type === "loan.requested") {
    text = `Our email to ${lender} about your request didn't go through. The admin can see it and resend it. ${lender} still sees your request in Incoming.`;
  } else if (failed.type === "loan.cancelled" && loan.decidedAt === undefined) {
    text = `Our email telling ${lender} you canceled didn't go through. The admin can see it and resend it.`;
  } else {
    text = "An email to you about this loan didn't go through. The admin can see it and resend it. This page always shows the latest.";
  }
  return <Notice tone="failed">{text}</Notice>;
}

function CancelControl({ loan }: { loan: MyLoan }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useAction(useMutation(api.loans.cancel));
  const lender = firstName(loan.lenderName);
  return (
    <div role="status" className="flex flex-wrap items-center gap-2.5">
      {confirming ? (
        <>
          <span className="text-[15px]">
            Cancel your request for the {loan.toolName}? {lender} will get an email.
          </span>
          <Button disabled={cancel.pending} onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button variant="danger" disabled={cancel.pending} onClick={() => void cancel.run({ loanId: loan._id })}>
            {cancel.pending ? "Canceling…" : "Yes, cancel"}
          </Button>
        </>
      ) : (
        <Button onClick={() => setConfirming(true)} aria-label={`Cancel request for ${loan.toolName}`}>
          Cancel request
        </Button>
      )}
      <InlineError message={cancel.error} />
    </div>
  );
}

function LoanCard({ loan, today }: { loan: MyLoan; today: string }) {
  const zone = useTimeZone();
  const late = loan.status === "approved" ? daysOverdue(loan.endDate, today) : 0;
  const ledger = buildLedger(loan);
  const active = loan.status === "pending" || loan.status === "approved";
  return (
    <article
      aria-label={`${loan.toolName}, ${formatDateRange(loan.startDate, loan.endDate)}`}
      className="overflow-hidden rounded-md border border-line-soft bg-white shadow-[0_12px_30px_-24px_rgba(21,32,27,0.5)]"
    >
      <div className="flex flex-col gap-2.5 border-b-2 border-rule-red px-5.5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="eyebrow">Asked {formatDate(todayIn(zone, loan.createdAt))}</span>
            <h2 className="font-display text-2xl leading-[1.15] font-extrabold" style={{ fontStretch: "108%" }}>
              {loan.toolName}
              {loan.toolRemoved ? <span className="ml-2 text-base font-normal text-ink-3">(no longer listed)</span> : null}
            </h2>
            <span className="flex flex-wrap items-center gap-1.5 text-[15px] text-ink-2">
              from {shortName(loan.lenderName)}
              {loan.lenderTrusted ? <TrustedBadge compact /> : null} ·
              <span className="mono text-sm">{formatDateRange(loan.startDate, loan.endDate)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LoanStamp status={loan.status} size="lg" tilt={-2} />
            {late > 0 ? <OverdueTag days={late} /> : null}
          </div>
        </div>
        <p className="max-w-[64ch]">{borrowerNextStep(loan, today)}</p>
        {loan.emailStatus === "failed" ? <FailedEmail loan={loan} /> : null}
        {loan.status === "pending" ? <CancelControl loan={loan} /> : null}
        {loan.status === "declined" ? (
          <Link href="/tools" className={buttonClass("ghost", "md", "self-start")}>
            Find another {loan.toolName.toLowerCase()}
          </Link>
        ) : null}
      </div>
      <details className="activity bg-[#FBFCFA] px-5.5 pt-1 pb-3.5" open={active}>
        <summary>
          <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          Activity <span className="mono text-[13px] font-medium text-ink-3">({ledger.length})</span>
        </summary>
        <ul aria-label="Activity">
          {ledger.map((entry, i) => {
            const look = TAG_LOOK[entry.tag];
            return (
              <li key={i} className="ledger-row" data-kind={entry.kind} data-status={entry.status}>
                <span className="mono text-[13px] text-ink-2">{entry.at ? formatDateTime(entry.at, zone) : "—"}</span>
                <span>
                  <span
                    className="mono rounded px-1.5 py-px text-xs font-semibold tracking-[0.05em]"
                    style={{ background: look.bg, color: look.fg }}
                  >
                    {look.label}
                  </span>
                </span>
                <span>{entry.what}</span>
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}

function OverdueBanner({ loans, today }: { loans: MyLoan[]; today: string }) {
  const late = loans
    .filter((l) => l.status === "approved" && l.endDate < today)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (late.length === 0) return null;
  const first = late[0];
  const lender = firstName(first.lenderName);
  const days = daysOverdue(first.endDate, today);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 rounded-xl border-2 border-ink bg-sun px-4.5 py-3.5">
      <div className="flex flex-col gap-0.5">
        <strong className="font-display text-[19px]">
          {late.length === 1
            ? `The ${first.toolName.toLowerCase()} was due back on ${formatDate(first.endDate)}.`
            : `${late.length} things you borrowed are overdue.`}
        </strong>
        <span className="text-[15px] text-[#2A2200]">
          {late.length === 1
            ? `Please return it to ${lender}. Already did? Let ${lender} know. The reminders stop once it's marked returned.`
            : "Please return them. The reminders stop once each lender marks it returned."}
        </span>
      </div>
      <span className="tag-yellow bg-ink text-sun">
        {days} {days === 1 ? "day" : "days"} late
      </span>
    </div>
  );
}

function RequestList() {
  const loans = useQuery(api.loans.listMine);
  const now = useNow();
  const today = todayIn(useTimeZone(), now);
  const [tab, setTab] = useState<Tab>("all");
  if (loans === undefined) return <LoadingState label="Loading your requests…" />;
  if (loans.length === 0) {
    return (
      <EmptyState
        title="You haven't asked to borrow anything yet"
        action={
          <Link href="/tools" className={buttonClass("primary")}>
            Browse tools
          </Link>
        }
      >
        Find something on the board, pick your dates and send a request. It shows up here with every email we send
        about it.
      </EmptyState>
    );
  }
  const count = (g: Exclude<Tab, "all">) => loans.filter((l) => groupOf(l) === g).length;
  const tabs: Array<[Tab, string, number]> = [
    ["all", "All", loans.length],
    ["waiting", "Waiting", count("waiting")],
    ["out", "With you", count("out")],
    ["past", "Past", count("past")],
  ];
  const shown = tab === "all" ? loans : loans.filter((l) => groupOf(l) === tab);
  return (
    <>
      <OverdueBanner loans={loans} today={today} />
      <div role="group" aria-label="Filter requests" className="scroll-x flex gap-1 border-b-2 border-line-soft">
        {tabs.map(([key, label, n]) => (
          <button key={key} type="button" className="tab" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label} <span className="mono text-[13px] text-ink-3">{n}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-2">Nothing here right now.</p>
      ) : (
        <ul className="flex flex-col gap-5.5">
          {shown.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} today={today} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function MyRequests() {
  return (
    <QueryBoundary>
      <RequestList />
    </QueryBoundary>
  );
}

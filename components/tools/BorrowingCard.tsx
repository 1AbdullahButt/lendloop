"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { formatDateRange, todayIn } from "@/lib/dates";
import { conditionLabel } from "@/lib/labels";
import { borrowerNextStep, holderLine } from "@/lib/loanText";
import { firstName, shortName } from "@/lib/names";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useNow } from "@/lib/useNow";
import { useTimeZone } from "../TimeZone";
import { buttonClass } from "../ui/Button";
import { Stamp, loanStatusLabel, loanTone } from "../ui/Stamp";
import { RequestForm } from "./RequestForm";
import { toolAvailability, type ToolItem } from "./ToolCard";

type Props = {
  tool: ToolItem | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Invisible tab stop at an edge of the modal sheet; it only ever hands focus on. */
function FocusGuard({ onFocus }: { onFocus: () => void }) {
  return (
    <span
      tabIndex={0}
      data-focus-guard=""
      aria-hidden="true"
      onFocus={onFocus}
      style={{ position: "fixed", opacity: 0, pointerEvents: "none", outline: "none" }}
    />
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * The selected tool's borrowing card: a sticky side panel on wide screens, a bottom sheet
 * on narrow ones (CSS in globals.css). Escape or the scrim closes the sheet.
 */
export function BorrowingCard({ tool, open, onClose, onDone }: Props) {
  const [sent, setSent] = useState<{ toolId: string; startDate: string; endDate: string } | null>(null);
  const sentHere = sent && tool && sent.toolId === tool._id ? sent : null;
  const today = todayIn(useTimeZone(), useNow());
  // My loans on this tool, live, so the sent request's stamp follows the lender's answer and
  // the status line knows when the tool is with me. Newest first, so `find` gets the latest.
  const mine = useQuery(api.loans.listMine, tool && !tool.isMine ? {} : "skip");
  const myLoans = (tool && mine?.filter((l) => l.toolId === tool._id)) || [];
  const sentLoan = sentHere
    ? myLoans.find((l) => l.startDate === sentHere.startDate && l.endDate === sentHere.endDate)
    : undefined;
  const sentStatus = sentLoan?.status ?? "pending";
  const holding = myLoans.find((l) => l.status === "approved");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus to the result so keyboard and screen reader users hear it.
  useEffect(() => {
    if (sentHere) document.getElementById("sent-stamp")?.focus();
  }, [sentHere]);

  const sheetOpen = open && tool !== null;
  // Same breakpoint as the .sheet rules in globals.css. Wide screens show a panel that is
  // always in the page; narrow ones show a sheet that is off screen while closed.
  const isSheet = useMediaQuery("(max-width: 860px)");
  const opener = useRef<HTMLElement | null>(null);

  // As a sheet: focus its title on open, and give focus back to the tool tag on close.
  useEffect(() => {
    if (!isSheet) return;
    if (sheetOpen) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.getElementById("card-title")?.focus();
    } else if (opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [isSheet, sheetOpen]);

  // A modal sheet keeps focus inside itself with a focus guard at each edge: Tab moves
  // through the sheet natively (date inputs keep their month/day/year stops), and only when
  // focus would leave does a guard send it around to the other end.
  const sheetRef = useRef<HTMLElement>(null);
  const modal = isSheet && sheetOpen;
  function focusEdge(edge: "first" | "last") {
    const els = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (el) => !el.hasAttribute("data-focus-guard"),
    );
    (edge === "first" ? els[0] : els[els.length - 1])?.focus();
  }

  return (
    <>
      <div className="scrim" data-open={sheetOpen} onClick={onClose} aria-hidden="true" />
      <aside
        className="sheet min-w-0 flex-[1_1_340px] min-[861px]:max-w-[400px]"
        data-open={sheetOpen}
        aria-labelledby="card-title"
        // A closed sheet is only translated off screen; inert keeps it out of Tab order and
        // away from screen readers until it opens.
        inert={isSheet && !sheetOpen}
        aria-modal={isSheet && sheetOpen ? true : undefined}
        role={isSheet && sheetOpen ? "dialog" : undefined}
        ref={sheetRef}
      >
        {modal ? <FocusGuard onFocus={() => focusEdge("last")} /> : null}
        {!tool ? (
          <div className="flex flex-col gap-2.5 px-6 py-7">
            <span className="eyebrow tracking-[0.08em]">Borrowing card</span>
            <h2 id="card-title" className="font-display text-[22px] font-extrabold">
              Pick a tool to choose dates
            </h2>
            <p className="text-ink-2">
              You&apos;ll see who&apos;s lending it, whether it&apos;s free, and exactly what happens after you ask.
            </p>
          </div>
        ) : (
          <>
            <div className="on-dark flex flex-col gap-1 bg-ink px-5 pt-4 pb-4.5 text-paper">
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-xs font-semibold tracking-[0.08em] text-sun">BORROWING CARD</span>
                <button type="button" className="sheet-close btn btn-on-dark" onClick={onClose} aria-label="Close borrowing card">
                  <CloseIcon />
                </button>
              </div>
              <h2 id="card-title" tabIndex={-1} className="font-display text-2xl font-extrabold" style={{ fontStretch: "108%" }}>
                {tool.name}
              </h2>
              <span className="text-sm text-on-night">
                Lent by {shortName(tool.ownerName)}
                {tool.ownerTrusted ? " · Trusted Lender" : ""} · {conditionLabel(tool.condition)} condition
              </span>
              <span className="text-sm text-[#E6E0C2]">
                {tool.isMine
                  ? "This one is yours."
                  : holding
                    ? holderLine(holding, today)
                    : tool.status === "available"
                    ? "Available now."
                    : `Out on loan right now. ${firstName(tool.ownerName)} can still approve dates that don't overlap.`}
              </span>
            </div>
            {tool.description ? <p className="px-5 pt-3.5 text-[15px] text-ink-2">{tool.description}</p> : null}

            {tool.isMine ? (
              <div className="flex flex-col gap-3 px-5 py-5.5">
                {/* Cosmetic: convex/loans.ts rejects requests on your own tool (R1) anyway. */}
                <p>You can&apos;t borrow your own tool. Edit it or answer its requests in My listings.</p>
                <Link href="/my/listings" className={buttonClass("ghost", "md", "self-start")}>
                  Go to My listings
                </Link>
              </div>
            ) : sentHere ? (
              <div role="status" className="flex flex-col items-start gap-4 px-5 py-6.5">
                {/* Pressed in only for the user's own send; a later answer swaps it quietly. */}
                <Stamp id="sent-stamp" tone={loanTone(sentStatus)} size="lg" tilt={-3} press={sentStatus === "pending"}>
                  {loanStatusLabel(sentStatus)} · {formatDateRange(sentHere.startDate, sentHere.endDate)}
                </Stamp>
                <p className="text-[17px]">
                  {sentLoan && sentStatus !== "pending"
                    ? borrowerNextStep(sentLoan, today)
                    : `Request sent. ${firstName(tool.ownerName)} will get an email shortly. You'll see the answer in My requests.`}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Link href="/my/requests" className={buttonClass("primary")}>
                    View my requests
                  </Link>
                  <button
                    type="button"
                    className={buttonClass("ghost")}
                    onClick={() => {
                      setSent(null);
                      onDone();
                    }}
                  >
                    Keep browsing
                  </button>
                </div>
              </div>
            ) : (
              <RequestForm
                key={tool._id}
                toolId={tool._id}
                toolName={tool.name}
                lenderFirst={firstName(tool.ownerName)}
                lenderShort={shortName(tool.ownerName)}
                onSent={(range) => setSent({ toolId: tool._id, ...range })}
              />
            )}
            <span className="sr-only">Status: {holding ? holderLine(holding, today) : toolAvailability(tool).label}</span>
          </>
        )}
        {modal ? <FocusGuard onFocus={() => focusEdge("first")} /> : null}
      </aside>
    </>
  );
}

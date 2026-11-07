"use client";

import { useMutation } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, daysBetween, formatDate, MAX_LOAN_EXTRA_DAYS, todayUtc } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { Button } from "../ui/Button";
import { InlineError } from "../ui/States";

type Props = {
  toolId: Id<"tools">;
  toolName: string;
  lenderFirst: string;
  lenderShort: string;
  onSent: (range: { startDate: string; endDate: string }) => void;
};

/**
 * Mirrors convex/loans.ts R2 so the borrower sees the problem before sending; the server
 * checks the same rules again and its message is shown if it disagrees.
 */
function dateProblem(startDate: string, endDate: string, today: string): { message: string; field: "start" | "end" } | null {
  if (!startDate || !endDate) return { message: "Pick both dates.", field: startDate ? "end" : "start" };
  if (startDate < today) return { message: `Start today (${formatDate(today)}) or later.`, field: "start" };
  if (endDate < startDate) return { message: "The end date is before the start date.", field: "end" };
  if (daysBetween(startDate, endDate) > MAX_LOAN_EXTRA_DAYS) {
    return {
      message: `Loans run at most ${MAX_LOAN_EXTRA_DAYS} days past the start. Pick an end date by ${formatDate(addDays(startDate, MAX_LOAN_EXTRA_DAYS))}.`,
      field: "end",
    };
  }
  return null;
}

export function RequestForm({ toolId, toolName, lenderFirst, lenderShort, onSent }: Props) {
  const id = useId();
  const today = todayUtc();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 2));
  const request = useMutation(api.loans.request);
  const { run, pending, error } = useAction(request);
  const problem = dateProblem(startDate, endDate, today);
  const days = problem ? 0 : daysBetween(startDate, endDate) + 1;
  const maxDays = MAX_LOAN_EXTRA_DAYS + 1;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) return;
    if (await run({ toolId, startDate, endDate })) onSent({ startDate, endDate });
  }

  function onStartChange(value: string) {
    setStartDate(value);
    if (value && endDate < value) setEndDate(value);
  }

  const msgId = `${id}-msg`;
  return (
    <form onSubmit={onSubmit} aria-label={`Request ${toolName}`} className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${id}-start`} className="field-label flex flex-col gap-1.5">
          From
          <input
            id={`${id}-start`}
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            aria-invalid={problem?.field === "start"}
            aria-describedby={msgId}
            className="field-input"
          />
        </label>
        <label htmlFor={`${id}-end`} className="field-label flex flex-col gap-1.5">
          Until
          <input
            id={`${id}-end`}
            type="date"
            required
            min={startDate || today}
            max={startDate ? addDays(startDate, MAX_LOAN_EXTRA_DAYS) : undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-invalid={problem?.field === "end"}
            aria-describedby={msgId}
            className="field-input"
          />
        </label>
      </div>

      <div id={msgId} aria-live="polite" className="flex flex-col gap-1.5">
        {problem ? (
          <InlineError message={problem.message} />
        ) : (
          <>
            <div className="mono flex justify-between text-[13px] text-ink-2">
              <span>
                {days} {days === 1 ? "day" : "days"}
              </span>
              <span>{maxDays} days max</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-mist" aria-hidden="true">
              <div className="h-full bg-pine" style={{ width: `${Math.max(4, Math.min(100, (days / maxDays) * 100))}%` }} />
            </div>
          </>
        )}
      </div>

      <ol className="flex flex-col border-t border-dashed border-line">
        {[
          { when: "NOW", what: `${lenderShort} gets an email about your request.` },
          {
            when: startDate ? formatDate(startDate).toUpperCase() : "START",
            what: `${lenderFirst} can say yes until your start date. After that the request lapses.`,
          },
          { when: endDate ? formatDate(endDate).toUpperCase() : "END", what: "Due back. Late? One reminder each morning." },
        ].map((step) => (
          <li key={step.what} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2.5 border-b border-dashed border-line py-2.5">
            <span className="mono text-sm font-semibold text-pine-ink">{step.when}</span>
            <span>{step.what}</span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-ink-3">Dates are calendar days in UTC.</p>
      <InlineError message={error} />
      <Button type="submit" variant="primary" size="lg" disabled={pending || problem !== null}>
        {pending ? "Sending…" : `Send request to ${lenderFirst}`}
      </Button>
    </form>
  );
}

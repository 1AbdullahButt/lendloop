"use client";

import { useMutation } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, MAX_LOAN_EXTRA_DAYS, todayUtc } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { Button } from "../ui/Button";
import { InlineError } from "../ui/States";

type Props = {
  toolId: Id<"tools">;
  toolName: string;
  onSent: () => void;
  onCancel: () => void;
};

const inputClass = "mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm";

/** Date-range request form. `min`/`max` are hints; convex/loans.ts enforces R2. */
export function RequestForm({ toolId, toolName, onSent, onCancel }: Props) {
  const id = useId();
  const today = todayUtc();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const request = useMutation(api.loans.request);
  const { run, pending, error } = useAction(request);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await run({ toolId, startDate, endDate })) onSent();
  }

  function onStartChange(value: string) {
    setStartDate(value);
    if (endDate < value) setEndDate(value);
  }

  return (
    <form onSubmit={onSubmit} aria-label={`Request ${toolName}`} className="mt-3 rounded-md bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${id}-start`} className="text-sm font-medium">
          Start date
          <input
            id={`${id}-start`}
            type="date"
            required
            min={today}
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label htmlFor={`${id}-end`} className="text-sm font-medium">
          End date
          <input
            id={`${id}-end`}
            type="date"
            required
            min={startDate || today}
            max={startDate ? addDays(startDate, MAX_LOAN_EXTRA_DAYS) : undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-stone-500">Dates are in UTC. Loans can last up to 30 days.</p>
      <InlineError message={error} />
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

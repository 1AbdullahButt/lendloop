"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useId, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { daysOverdue, formatDate, formatDateRange, todayUtc } from "@/lib/dates";
import { categoryLabel, conditionLabel } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { useAction } from "@/lib/useAction";
import { Button, buttonClass } from "../ui/Button";
import { OverdueTag, Stamp } from "../ui/Stamp";
import { InlineError } from "../ui/States";
import { ToolForm, type ToolFormValues } from "./ToolForm";

export type Listing = FunctionReturnType<typeof api.tools.listMine>[number];
type Request = Listing["requests"][number];

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function overlaps(a: Request, b: Request) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** One plain-English line about where the tool is right now. */
function statusLine(listing: Listing, today: string): string {
  const approved = listing.requests
    .filter((r) => r.status === "approved")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pending = listing.requests.filter((r) => r.status === "pending");
  const current = approved.find((r) => r.startDate <= today);
  let line: string;
  if (current) {
    const who = shortName(current.borrowerName);
    line =
      current.endDate < today
        ? `With ${who} since ${formatDate(current.startDate)}. It was due back ${formatDate(current.endDate)}.`
        : `With ${who} until ${formatDate(current.endDate)}.`;
  } else if (approved.length > 0) {
    line = `Booked by ${shortName(approved[0].borrowerName)} for ${formatDateRange(approved[0].startDate, approved[0].endDate)}.`;
  } else if (pending.length === 0) {
    return "Nobody has asked yet.";
  } else {
    line = "";
  }
  if (pending.length === 1) {
    const p = pending[0];
    const stale = p.startDate < today ? ", but that start date has passed" : "";
    return `${line} ${shortName(p.borrowerName)} asked for ${formatDateRange(p.startDate, p.endDate)}${stale}.`.trim();
  }
  if (pending.length > 1) {
    const clash = pending.some((a, i) => pending.some((b, j) => i !== j && overlaps(a, b)));
    return `${line} ${plural(pending.length, "neighbor wants", "neighbors want")} it${clash ? " for overlapping dates" : ""}.`.trim();
  }
  return line;
}

function DeleteControl({ listing, onDeleted }: { listing: Listing; onDeleted: (name: string) => void }) {
  const lockId = useId();
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(useMutation(api.tools.remove));
  // Mirrors tools.remove, which answers CONFLICT while the tool is out.
  const locked = listing.status === "on_loan";

  if (confirming) {
    const waiting = listing.pendingCount;
    return (
      <>
        <span className="text-[15px]">
          {waiting > 0
            ? `Delete it? Its ${plural(waiting, "waiting request", "waiting requests")} will be canceled.`
            : "Delete it from the board?"}
        </span>
        <Button disabled={remove.pending} onClick={() => setConfirming(false)}>
          Keep it
        </Button>
        <Button
          variant="danger"
          disabled={remove.pending}
          onClick={async () => {
            if (await remove.run({ toolId: listing._id })) onDeleted(listing.name);
          }}
        >
          {remove.pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <InlineError message={remove.error} />
      </>
    );
  }
  return (
    <>
      <Button
        variant="danger-ghost"
        onClick={() => setConfirming(true)}
        disabled={locked}
        aria-label={`Delete ${listing.name}`}
        aria-describedby={locked ? lockId : undefined}
      >
        Delete
      </Button>
      {locked ? (
        <span id={lockId} className="text-sm text-ink-2">
          You can delete it once it&apos;s back.
        </span>
      ) : null}
    </>
  );
}

export function ListingCard({ listing, onDeleted }: { listing: Listing; onDeleted: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const update = useAction(useMutation(api.tools.update));
  const today = todayUtc();

  async function save(values: ToolFormValues) {
    const ok = await update.run({ toolId: listing._id, ...values });
    if (ok) setEditing(false);
    return ok;
  }

  if (editing) {
    return (
      <article className="tag-card flex flex-col gap-3">
        <span className="tag-hole" aria-hidden="true" />
        <h3 className="font-display text-[22px] font-extrabold">Edit {listing.name}</h3>
        <ToolForm
          initial={{
            name: listing.name,
            category: listing.category,
            condition: listing.condition,
            description: listing.description,
          }}
          submitLabel="Save changes"
          pending={update.pending}
          error={update.error}
          onSubmit={save}
          onCancel={() => {
            update.clearError();
            setEditing(false);
          }}
        />
      </article>
    );
  }

  const overdue = listing.requests
    .filter((r) => r.status === "approved" && r.endDate < today)
    .reduce((max, r) => Math.max(max, daysOverdue(r.endDate, today)), 0);
  const waiting = listing.pendingCount;

  return (
    <article className="tag-card flex flex-col gap-2 pl-10.5">
      <span className="tag-hole top-[22px] left-[15px]" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="eyebrow">
            {categoryLabel(listing.category)} · {conditionLabel(listing.condition)}
          </span>
          <h3 className="font-display text-[22px] font-extrabold [overflow-wrap:anywhere]" style={{ fontStretch: "108%" }}>
            {listing.name}
          </h3>
        </div>
        <span className="inline-flex flex-wrap gap-1.5">
          {listing.status === "on_loan" ? <Stamp tone="pending">On loan</Stamp> : <Stamp tone="approved">Available</Stamp>}
          {overdue > 0 ? <OverdueTag days={overdue} /> : null}
        </span>
      </div>
      {listing.description ? <p className="max-w-[64ch] text-ink-2">{listing.description}</p> : null}
      <p className="text-[15px]">{statusLine(listing, today)}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        {waiting > 0 ? (
          <Link href="/my/incoming" className={buttonClass("primary")}>
            Review {plural(waiting, "request", "requests")}
          </Link>
        ) : null}
        <Button onClick={() => setEditing(true)} aria-label={`Edit ${listing.name}`}>
          Edit
        </Button>
        <DeleteControl listing={listing} onDeleted={onDeleted} />
      </div>
    </article>
  );
}

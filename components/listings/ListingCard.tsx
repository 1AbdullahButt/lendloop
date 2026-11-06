"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { formatDateRange } from "@/lib/dates";
import { categoryLabel, conditionLabel } from "@/lib/labels";
import { useAction } from "@/lib/useAction";
import { LenderActions } from "../loans/LenderActions";
import { PersonName, StatusBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { Card } from "../ui/PageHeader";
import { InlineError } from "../ui/States";
import { ToolForm, type ToolFormValues } from "./ToolForm";

export type Listing = FunctionReturnType<typeof api.tools.listMine>[number];

function ListingRequests({ listing }: { listing: Listing }) {
  if (listing.requests.length === 0) {
    return <p className="mt-3 text-sm text-stone-500">No open requests.</p>;
  }
  return (
    <div className="mt-3">
      <h3 className="text-sm font-medium">Open requests</h3>
      <ul className="mt-1 divide-y divide-stone-100">
        {listing.requests.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              <PersonName name={r.borrowerName} trusted={r.borrowerTrusted} /> ·{" "}
              {formatDateRange(r.startDate, r.endDate)} <StatusBadge status={r.status} />
            </span>
            <LenderActions loanId={r._id} status={r.status} toolName={listing.name} startDate={r.startDate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteControl({ listing }: { listing: Listing }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(useMutation(api.tools.remove));
  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)} aria-label={`Delete ${listing.name}`}>
        Delete
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className="flex gap-2">
        <Button
          variant="danger"
          disabled={remove.pending}
          onClick={() => void remove.run({ toolId: listing._id })}
        >
          {remove.pending ? "Deleting…" : "Confirm delete"}
        </Button>
        <Button disabled={remove.pending} onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </span>
      <InlineError message={remove.error} />
    </span>
  );
}

export function ListingCard({ listing }: { listing: Listing }) {
  const [editing, setEditing] = useState(false);
  const update = useAction(useMutation(api.tools.update));

  async function save(values: ToolFormValues) {
    const ok = await update.run({ toolId: listing._id, ...values });
    if (ok) setEditing(false);
    return ok;
  }

  if (editing) {
    return (
      <Card>
        <h2 className="mb-3 font-semibold">Edit {listing.name}</h2>
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
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{listing.name}</h2>
          <p className="text-sm text-stone-500">
            {categoryLabel(listing.category)} · Condition: {conditionLabel(listing.condition)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={listing.status} />
          <Button onClick={() => setEditing(true)} aria-label={`Edit ${listing.name}`}>
            Edit
          </Button>
          <DeleteControl listing={listing} />
        </div>
      </div>
      {listing.description ? <p className="mt-2 text-sm text-stone-700">{listing.description}</p> : null}
      <ListingRequests listing={listing} />
    </Card>
  );
}

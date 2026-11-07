"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useAction } from "@/lib/useAction";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { ListingCard } from "./ListingCard";
import { ToolForm, type ToolFormValues } from "./ToolForm";

function NewListing({ flash, onFlash }: { flash: string; onFlash: (message: string) => void }) {
  const create = useAction(useMutation(api.tools.create));
  async function submit(values: ToolFormValues) {
    const ok = await create.run(values);
    if (ok) onFlash(`${values.name.trim()} is on the board.`);
    return ok;
  }
  return (
    <section
      aria-labelledby="form-title"
      className="flex min-w-0 max-w-[460px] flex-[1_1_380px] flex-col gap-4.5 rounded-[18px] border-2 border-ink bg-white p-5.5"
    >
      <h2 id="form-title" className="font-display text-2xl font-extrabold">
        List a tool
      </h2>
      <ToolForm submitLabel="Put it on the board" pending={create.pending} error={create.error} onSubmit={submit} />
      <p aria-live="polite" className="min-h-px text-[15px] text-pine-ink">
        {flash}
      </p>
    </section>
  );
}

function ListingList({ onFlash }: { onFlash: (message: string) => void }) {
  const listings = useQuery(api.tools.listMine);
  return (
    <section aria-labelledby="list-title" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
      <h2 id="list-title" className="font-display text-2xl font-extrabold">
        On the board{listings && listings.length > 0 ? ` (${listings.length})` : ""}
      </h2>
      {listings === undefined ? (
        <LoadingState label="Loading your tools…" />
      ) : listings.length === 0 ? (
        <EmptyState title="Nothing on the board from you yet">
          Start with something you use once or twice a year, like a ladder, a drill or a tent. Neighbors ask for
          dates, and you say yes or no to each one.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {listings.map((listing) => (
            <li key={listing._id}>
              <ListingCard listing={listing} onDeleted={(name) => onFlash(`${name} was taken off the board.`)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MyListings() {
  const [flash, setFlash] = useState("");
  return (
    <div className="flex flex-wrap items-start gap-8">
      <NewListing flash={flash} onFlash={setFlash} />
      <QueryBoundary>
        <ListingList onFlash={setFlash} />
      </QueryBoundary>
    </div>
  );
}

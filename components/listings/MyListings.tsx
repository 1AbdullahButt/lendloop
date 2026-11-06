"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAction } from "@/lib/useAction";
import { Card } from "../ui/PageHeader";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { ListingCard } from "./ListingCard";
import { ToolForm } from "./ToolForm";

function NewListing() {
  const create = useAction(useMutation(api.tools.create));
  return (
    <Card>
      <h2 className="mb-3 font-semibold">List a tool</h2>
      <ToolForm submitLabel="Add tool" pending={create.pending} error={create.error} onSubmit={create.run} />
    </Card>
  );
}

function ListingList() {
  const listings = useQuery(api.tools.listMine);
  if (listings === undefined) return <LoadingState label="Loading your tools…" />;
  if (listings.length === 0) {
    return <EmptyState title="You haven't listed any tools yet">Use the form to add your first one.</EmptyState>;
  }
  return (
    <ul className="space-y-4">
      {listings.map((listing) => (
        <li key={listing._id}>
          <ListingCard listing={listing} />
        </li>
      ))}
    </ul>
  );
}

export function MyListings() {
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div>
        <NewListing />
      </div>
      <section aria-label="Your tools">
        <QueryBoundary>
          <ListingList />
        </QueryBoundary>
      </section>
    </div>
  );
}

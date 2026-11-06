"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { formatDateRange } from "@/lib/dates";
import { PersonName, StatusBadge } from "../ui/Badges";
import { Card } from "../ui/PageHeader";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { LenderActions } from "./LenderActions";

type IncomingLoan = FunctionReturnType<typeof api.loans.listIncoming>[number];

function IncomingCard({ loan }: { loan: IncomingLoan }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {loan.toolName} <StatusBadge status={loan.status} />
          </h2>
          <p className="text-sm text-stone-600">
            {formatDateRange(loan.startDate, loan.endDate)} · requested by{" "}
            <PersonName name={loan.borrowerName} trusted={loan.borrowerTrusted} />
          </p>
        </div>
        <LenderActions loanId={loan._id} status={loan.status} toolName={loan.toolName} startDate={loan.startDate} />
      </div>
    </Card>
  );
}

function IncomingList() {
  const loans = useQuery(api.loans.listIncoming);
  if (loans === undefined) return <LoadingState label="Loading incoming requests…" />;
  if (loans.length === 0) {
    return <EmptyState title="No requests on your tools yet">When a neighbour asks to borrow, it shows up here.</EmptyState>;
  }
  return (
    <ul className="space-y-4">
      {loans.map((loan) => (
        <li key={loan._id}>
          <IncomingCard loan={loan} />
        </li>
      ))}
    </ul>
  );
}

export function IncomingRequests() {
  return (
    <QueryBoundary>
      <IncomingList />
    </QueryBoundary>
  );
}

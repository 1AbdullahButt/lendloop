"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { formatDateRange } from "@/lib/dates";
import { useAction } from "@/lib/useAction";
import { useNow } from "@/lib/useNow";
import { PersonName, StatusBadge } from "../ui/Badges";
import { Button } from "../ui/Button";
import { Card } from "../ui/PageHeader";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, InlineError, LoadingState } from "../ui/States";
import { ActivityList } from "./ActivityList";

type MyLoan = FunctionReturnType<typeof api.loans.listMine>[number];

function CancelButton({ loan }: { loan: MyLoan }) {
  const cancel = useAction(useMutation(api.loans.cancel));
  return (
    <div className="text-right">
      <Button
        variant="danger"
        disabled={cancel.pending}
        onClick={() => void cancel.run({ loanId: loan._id })}
        aria-label={`Cancel request for ${loan.toolName}`}
      >
        {cancel.pending ? "Cancelling…" : "Cancel request"}
      </Button>
      <InlineError message={cancel.error} />
    </div>
  );
}

function RequestCard({ loan, now }: { loan: MyLoan; now: number }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {loan.toolName} <StatusBadge status={loan.status} />
          </h2>
          <p className="text-sm text-stone-600">
            {formatDateRange(loan.startDate, loan.endDate)} · from{" "}
            <PersonName name={loan.lenderName} trusted={loan.lenderTrusted} />
          </p>
        </div>
        {loan.status === "pending" ? <CancelButton loan={loan} /> : null}
      </div>
      <div className="mt-3 border-t border-stone-100 pt-2">
        <ActivityList items={loan.activity} now={now} />
      </div>
    </Card>
  );
}

function RequestList() {
  const loans = useQuery(api.loans.listMine);
  const now = useNow();
  if (loans === undefined) return <LoadingState label="Loading your requests…" />;
  if (loans.length === 0) {
    return <EmptyState title="You haven't requested anything yet">Browse Tools to find something to borrow.</EmptyState>;
  }
  return (
    <ul className="space-y-4">
      {loans.map((loan) => (
        <li key={loan._id}>
          <RequestCard loan={loan} now={now} />
        </li>
      ))}
    </ul>
  );
}

export function MyRequests() {
  return (
    <QueryBoundary>
      <RequestList />
    </QueryBoundary>
  );
}

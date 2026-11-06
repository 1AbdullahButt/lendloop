"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatDateRange } from "@/lib/dates";
import { PersonName, StatusBadge } from "../ui/Badges";
import { EmptyState, LoadingState } from "../ui/States";
import { AdminTable, Cell } from "./AdminTable";

export function AdminLoans() {
  const loans = useQuery(api.admin.listAllLoans);
  if (loans === undefined) return <LoadingState label="Loading loans…" />;
  if (loans.length === 0) return <EmptyState title="No loans or requests yet" />;
  return (
    <AdminTable caption="All loans" headers={["Tool", "Borrower", "Lender", "Dates", "Status"]}>
      {loans.map((loan) => (
        <tr key={loan._id}>
          <Cell>
            {loan.toolName}
            {loan.toolRemoved ? <span className="ml-1 text-xs text-red-700">(removed)</span> : null}
          </Cell>
          <Cell>{loan.borrowerName}</Cell>
          <Cell>
            <PersonName name={loan.lenderName} trusted={loan.lenderTrusted} />
          </Cell>
          <Cell className="whitespace-nowrap">{formatDateRange(loan.startDate, loan.endDate)}</Cell>
          <Cell>
            <StatusBadge status={loan.status} />
          </Cell>
        </tr>
      ))}
    </AdminTable>
  );
}

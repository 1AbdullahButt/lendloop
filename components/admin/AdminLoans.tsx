"use client";

import { daysOverdue, formatDateRange } from "@/lib/dates";
import { shortName } from "@/lib/names";
import { TrustedBadge } from "../ui/Badges";
import { LoanStamp, OverdueTag } from "../ui/Stamp";
import { EmptyState } from "../ui/States";
import type { AdminLoan } from "./AdminEvents";
import { AdminSection, AdminTable } from "./AdminTable";

export function AdminLoans({ loans, today }: { loans: AdminLoan[]; today: string }) {
  return (
    <AdminSection id="loans" title="All loans and requests">
      {loans.length === 0 ? (
        <EmptyState title="No loans or requests yet" />
      ) : (
        <AdminTable caption="All loans and requests, newest first" headers={["Tool", "Lender", "Borrower", "Dates", "Status"]}>
          {loans.map((loan) => {
            const late = loan.status === "approved" ? daysOverdue(loan.endDate, today) : 0;
            const stale = loan.status === "pending" && loan.startDate < today;
            return (
              <tr key={loan._id}>
                <td>
                  {loan.toolName}
                  {loan.toolRemoved ? <span className="ml-1.5 text-sm text-ink-3">(removed)</span> : null}
                </td>
                <td>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {shortName(loan.lenderName)}
                    {loan.lenderTrusted ? <TrustedBadge compact /> : null}
                  </span>
                </td>
                <td>{shortName(loan.borrowerName)}</td>
                <td className="num">{formatDateRange(loan.startDate, loan.endDate)}</td>
                <td>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <LoanStamp status={loan.status} size="sm" />
                    {late > 0 ? <OverdueTag days={late} className="text-xs" /> : null}
                    {stale ? <span className="text-sm text-ink-2">Start date passed</span> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </AdminSection>
  );
}

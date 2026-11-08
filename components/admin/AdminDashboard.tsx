"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { splitFailures } from "@/lib/adminEvents";
import { todayIn } from "@/lib/dates";
import { useNow } from "@/lib/useNow";
import { useTimeZone } from "../TimeZone";
import { QueryBoundary } from "../ui/QueryBoundary";
import { EmptyState, LoadingState } from "../ui/States";
import { AdminEvents, type AdminLoan } from "./AdminEvents";
import { AdminLoans } from "./AdminLoans";
import { AdminTools } from "./AdminTools";
import { AdminUsers } from "./AdminUsers";

function AdminsOnly() {
  return <EmptyState title="Admins only">This page is for LendLoop admins. Ask an admin if you need access.</EmptyState>;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function AdminBody() {
  const events = useQuery(api.admin.listAutomationEvents, {});
  const loans = useQuery(api.admin.listAllLoans);
  const tools = useQuery(api.admin.listTools);
  const users = useQuery(api.admin.listUsers);
  const today = todayIn(useTimeZone(), useNow());
  if (!events || !loans || !tools || !users) return <LoadingState label="Loading the admin view…" />;

  const loanById = new Map<string, AdminLoan>(loans.map((l) => [l._id, l]));
  // Only failures an admin can act on; out-of-date ones sit under "Older failures".
  const failed = splitFailures(events, loanById).active.filter((e) => e.status === "failed").length;
  const overdue = loans.filter((l) => l.status === "approved" && l.endDate < today).length;
  const out = tools.filter((t) => t.status === "on_loan" && t.removedAt === undefined).length;
  const waitingByTool = new Map<string, number>();
  for (const l of loans) if (l.status === "pending") waitingByTool.set(l.toolId, (waitingByTool.get(l.toolId) ?? 0) + 1);
  const waiting = [...waitingByTool.values()].reduce((a, b) => a + b, 0);
  const toolCounts = new Map<string, number>();
  for (const t of tools) if (t.removedAt === undefined) toolCounts.set(t.ownerId, (toolCounts.get(t.ownerId) ?? 0) + 1);

  return (
    <>
      <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border-2 border-ink bg-white px-4.5 py-3.5">
        <strong className="font-display text-lg">Needs attention</strong>
        {failed > 0 ? (
          <a href="#emails" className="inline-flex min-h-11 items-center font-bold text-brick">
            {plural(failed, "failed email to resend", "failed emails to resend")}
          </a>
        ) : (
          <span className="text-ink-2">No failed emails</span>
        )}
        {overdue > 0 ? (
          <a href="#loans" className="inline-flex min-h-11 items-center font-bold text-ochre-ink">
            {plural(overdue, "loan overdue", "loans overdue")}
          </a>
        ) : (
          <span className="text-ink-2">Nothing overdue</span>
        )}
        <span className="text-ink-2">
          {plural(out, "tool", "tools")} out on loan · {plural(waiting, "request", "requests")} waiting
        </span>
      </div>
      <AdminEvents events={events} loans={loanById} />
      <AdminLoans loans={loans} today={today} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-start gap-8">
        <AdminUsers users={users} toolCounts={toolCounts} />
        <AdminTools tools={tools} waitingByTool={waitingByTool} />
      </div>
    </>
  );
}

export function AdminDashboard() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <LoadingState />;
  // Skip the admin queries for plain users; if this check is stale, Convex answers FORBIDDEN
  // and the boundary shows the same friendly state.
  if (me.role !== "admin") return <AdminsOnly />;
  return (
    <QueryBoundary forbidden={<AdminsOnly />}>
      <AdminBody />
    </QueryBoundary>
  );
}

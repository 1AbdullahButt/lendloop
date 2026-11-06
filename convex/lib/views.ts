import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const ACTIVITY_LIMIT = 10;

export type Activity = {
  kind: Doc<"automationEvents">["kind"];
  status: Doc<"automationEvents">["status"];
  createdAt: number;
  sentAt?: number;
};

/** Public display info only: name and badge, never email. */
export type PersonView = { name: string; trusted: boolean };

const UNKNOWN: PersonView = { name: "Unknown neighbour", trusted: false };

/** Small per-request cache so lists don't re-read the same user or tool. */
export function makeLookups(ctx: QueryCtx) {
  const people = new Map<Id<"users">, Promise<PersonView>>();
  const tools = new Map<Id<"tools">, Promise<Doc<"tools"> | null>>();
  return {
    person(id: Id<"users">): Promise<PersonView> {
      if (!people.has(id)) {
        people.set(
          id,
          ctx.db.get(id).then((u) => (u ? { name: u.name, trusted: u.trustedLender } : UNKNOWN)),
        );
      }
      return people.get(id)!;
    },
    tool(id: Id<"tools">): Promise<Doc<"tools"> | null> {
      if (!tools.has(id)) tools.set(id, ctx.db.get(id));
      return tools.get(id)!;
    },
  };
}

/**
 * Recent automation for one loan, newest first. Idempotency keys and n8n error text
 * stay out: the borrower only needs "what happened and when".
 */
export async function loanActivity(ctx: QueryCtx, loanId: Id<"loans">): Promise<Activity[]> {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
  return events
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, ACTIVITY_LIMIT)
    .map((e) => ({
      kind: e.kind,
      status: e.status,
      createdAt: e.createdAt,
      ...(e.sentAt !== undefined ? { sentAt: e.sentAt } : {}),
    }));
}

// Dev-only fixtures for manual checks, e.g. `npx convex run seed:overdueLoan`.
// Internal only, and every address is on example.com.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { addDaysUtc, todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";

async function seedUser(ctx: MutationCtx, clerkId: string, name: string, email: string): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("users", { clerkId, name, email, role: "user", trustedLender: false });
}

/**
 * Creates an approved loan whose endDate was yesterday (UTC), so the overdue workflow
 * has something to remind about. Pass existing ids to reuse your own users/tools.
 */
export const overdueLoan = internalMutation({
  args: {
    borrowerId: v.optional(v.id("users")),
    toolId: v.optional(v.id("tools")),
  },
  handler: async (ctx, args) => {
    const today = todayUtc();
    let toolId = args.toolId;
    let lenderId: Id<"users">;
    if (toolId) {
      const tool = await ctx.db.get(toolId);
      if (!tool) throw appError("NOT_FOUND", "Tool not found.");
      lenderId = tool.ownerId;
    } else {
      lenderId = await seedUser(ctx, "seed_lender", "Sam Seed-Lender", "seed-lender@example.com");
      toolId = await ctx.db.insert("tools", {
        ownerId: lenderId,
        name: "Seed hedge trimmer",
        category: "garden",
        condition: "good",
        description: "Seeded for the overdue reminder check.",
        status: "available",
        createdAt: Date.now(),
      });
    }
    const borrowerId =
      args.borrowerId ?? (await seedUser(ctx, "seed_borrower", "Bea Seed-Borrower", "seed-borrower@example.com"));
    if (borrowerId === lenderId) throw appError("INVALID", "Borrower and lender must differ.");

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId,
      lenderId,
      startDate: addDaysUtc(today, -3),
      endDate: addDaysUtc(today, -1),
      status: "approved",
      createdAt: now,
      decidedAt: now,
    });
    await ctx.db.patch(toolId, { status: "on_loan" });
    return { loanId, toolId, borrowerId, lenderId };
  },
});

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { queueLoanEvent } from "./events";

/**
 * Soft delete shared by the owner (`tools.remove`) and moderation (`admin.removeListing`).
 * Pending requests are cancelled (R6). `decidedAt` is set on them because the lender side
 * made the call; that is how delivery knows to notify the borrower rather than the lender.
 * An approved loan is left alone so it can still be marked returned.
 */
export async function softRemoveTool(ctx: MutationCtx, tool: Doc<"tools">): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(tool._id, { removedAt: now });

  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
    .collect();
  for (const loan of loans) {
    if (loan.status !== "pending") continue;
    await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: now });
    await queueLoanEvent(ctx, loan._id, "loan.cancelled");
  }
}

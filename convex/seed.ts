// Dev-only fixtures for demos and manual checks, e.g. `npx convex run seed:neighbors`.
// Internal only (never client-callable), and every address is on example.com.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { addDaysUtc, todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";

type SeedTool = Pick<Doc<"tools">, "name" | "category" | "condition" | "description">;
type Neighbor = { key: "marcus" | "olivia" | "jake"; name: string; email: string; tools: SeedTool[] };

/** The board's demo neighbors. scripts/clerk-test-users.mjs creates the same people in Clerk. */
export const NEIGHBORS: Neighbor[] = [
  {
    key: "marcus",
    name: "Marcus Davis",
    email: "marcus+clerk_test@example.com",
    tools: [
      { name: "Jigsaw", category: "power_tools", condition: "fair", description: "Comes with three wood blades." },
      { name: "Carpet cleaner", category: "cleaning", condition: "fair", description: "Bring your own cleaning solution." },
    ],
  },
  {
    key: "olivia",
    name: "Olivia Parker",
    email: "olivia+clerk_test@example.com",
    tools: [
      { name: "Ladder, 6 ft", category: "hand_tools", condition: "worn", description: "Aluminum step ladder. One rung has a dent, still sturdy." },
      { name: "Stand mixer", category: "kitchen", condition: "good", description: "5 qt bowl, whisk and dough hook." },
    ],
  },
  {
    key: "jake",
    name: "Jake Thompson",
    email: "jake+clerk_test@example.com",
    tools: [
      { name: "Two-person tent", category: "camping", condition: "new", description: "Sets up in ten minutes. Rain fly included." },
      { name: "Tile cutter", category: "other", condition: "good", description: "Manual cutter, up to 24 in tiles." },
    ],
  },
];

/**
 * Finds the neighbor's row by email (or the placeholder clerkId) and links it to their real
 * Clerk id when one is given, so a later sign-in reuses this row instead of adding a second.
 * If that person already signed in (a row with the real Clerk id exists), that row wins:
 * two rows must never share a clerkId, or `users.ensure` would fail for them. The emptied
 * placeholder is then deleted, and later runs prefer a real row over a placeholder.
 */
async function upsertNeighbor(ctx: MutationCtx, n: Neighbor, clerkId?: string): Promise<Id<"users">> {
  const placeholder = `seed_${n.key}`;
  const all = await ctx.db.query("users").collect();
  const signedIn = clerkId ? all.find((u) => u.clerkId === clerkId) : undefined;
  const byEmail = all.filter((u) => u.email === n.email);
  // A real (signed-in) row beats the placeholder, so later seed runs land on the real person.
  const existing =
    byEmail.find((u) => !u.clerkId.startsWith("seed_")) ??
    byEmail[0] ??
    all.find((u) => u.clerkId === placeholder);
  const stale = all.find((u) => u.clerkId === placeholder);
  const target = signedIn ?? (existing && !existing.clerkId.startsWith("seed_") ? existing : undefined);
  if (target) {
    await ctx.db.patch(target._id, { name: n.name });
    if (stale && stale._id !== target._id) await retirePlaceholder(ctx, stale._id, target._id);
    return target._id;
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      name: n.name,
      email: n.email,
      ...(clerkId && existing.clerkId !== clerkId ? { clerkId } : {}),
    });
    return existing._id;
  }
  return await ctx.db.insert("users", {
    clerkId: clerkId ?? placeholder,
    name: n.name,
    email: n.email,
    role: "user",
    trustedLender: false,
  });
}

/**
 * Moves loan-free tools from a placeholder seed row to the real one, so the board has no
 * duplicates, then deletes the placeholder if nothing points at it any more.
 */
async function retirePlaceholder(ctx: MutationCtx, from: Id<"users">, to: Id<"users">): Promise<void> {
  const tools = await ctx.db
    .query("tools")
    .withIndex("by_owner", (q) => q.eq("ownerId", from))
    .collect();
  let kept = 0;
  for (const tool of tools) {
    const loan = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .first();
    // A tool with loans keeps its owner so lenderId on those loans still matches.
    if (loan) kept++;
    else await ctx.db.patch(tool._id, { ownerId: to });
  }
  const asBorrower = await ctx.db
    .query("loans")
    .withIndex("by_borrower", (q) => q.eq("borrowerId", from))
    .first();
  const asLender = await ctx.db
    .query("loans")
    .withIndex("by_lender", (q) => q.eq("lenderId", from))
    .first();
  if (kept === 0 && !asBorrower && !asLender) await ctx.db.delete(from);
}

async function ensureTool(ctx: MutationCtx, ownerId: Id<"users">, tool: SeedTool): Promise<Id<"tools">> {
  const mine = await ctx.db
    .query("tools")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  const found = mine.find((t) => t.name === tool.name && t.removedAt === undefined);
  if (found) return found._id;
  return await ctx.db.insert("tools", { ownerId, ...tool, status: "available", createdAt: Date.now() });
}

const clerkIds = v.optional(
  v.object({ marcus: v.optional(v.string()), olivia: v.optional(v.string()), jake: v.optional(v.string()) }),
);

/**
 * Puts Marcus D., Olivia P. and Jake T. and their tools on the board. Safe to run again:
 * people are matched by email and tools by owner + name.
 */
export const neighbors = internalMutation({
  args: { clerkIds },
  handler: async (ctx, args) => {
    let tools = 0;
    for (const n of NEIGHBORS) {
      const ownerId = await upsertNeighbor(ctx, n, args.clerkIds?.[n.key]);
      for (const tool of n.tools) {
        await ensureTool(ctx, ownerId, tool);
        tools++;
      }
    }
    return { neighbors: NEIGHBORS.length, tools };
  },
});

function neighbor(key: Neighbor["key"]): Neighbor {
  return NEIGHBORS.find((n) => n.key === key)!;
}

/**
 * Creates an approved loan whose endDate was yesterday (UTC), so the overdue workflow has
 * something to remind about. By default Olivia P. lends her stand mixer to Jake T.; pass
 * your own users id as borrowerId to see the reminder on your My requests page.
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
      const olivia = neighbor("olivia");
      lenderId = await upsertNeighbor(ctx, olivia);
      toolId = await ensureTool(ctx, lenderId, olivia.tools.find((t) => t.name === "Stand mixer")!);
    }
    const borrowerId = args.borrowerId ?? (await upsertNeighbor(ctx, neighbor("jake")));
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

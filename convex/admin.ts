import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { softRemoveTool } from "./lib/removal";
import { makeLookups } from "./lib/views";
import { eventKind, eventStatus } from "./schema";

const DEFAULT_EVENT_LIMIT = 200;

export const listAllLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const lookups = makeLookups(ctx);
    const loans = await ctx.db.query("loans").order("desc").collect();
    return await Promise.all(
      loans.map(async (l) => {
        const tool = await lookups.tool(l.toolId);
        const borrower = await lookups.person(l.borrowerId);
        const lender = await lookups.person(l.lenderId);
        return {
          ...l,
          toolName: tool?.name ?? "Deleted tool",
          toolRemoved: !tool || tool.removedAt !== undefined,
          borrowerName: borrower.name,
          lenderName: lender.name,
          lenderTrusted: lender.trusted,
        };
      }),
    );
  },
});

/** Includes removed tools: moderation needs the full picture. */
export const listTools = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const lookups = makeLookups(ctx);
    const tools = await ctx.db.query("tools").order("desc").collect();
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await lookups.person(t.ownerId);
        return { ...t, ownerName: owner.name, ownerTrusted: owner.trusted };
      }),
    );
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").collect();
  },
});

/** Outbound and reminder log, newest first; failed rows carry `lastError` (AC17). */
export const listAutomationEvents = query({
  args: {
    status: v.optional(eventStatus),
    kind: v.optional(eventKind),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? DEFAULT_EVENT_LIMIT), 1), 1000);
    const events = await ctx.db.query("automationEvents").collect();
    return events
      .filter((e) => (!args.status || e.status === args.status) && (!args.kind || e.kind === args.kind))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

/** Moderation removal: works even while on loan; the active loan stays returnable. */
export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw appError("NOT_FOUND", "Tool not found.");
    if (tool.removedAt !== undefined) return null;
    await softRemoveTool(ctx, tool);
    return null;
  },
});

/** Touches `trustedLender` only; role changes are dashboard-only (users.setRole). */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(user._id, { trustedLender: args.trusted });
    return null;
  },
});

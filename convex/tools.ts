import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { softRemoveTool } from "./lib/removal";
import { cleanDescription, cleanToolName } from "./lib/validation";
import { makeLookups } from "./lib/views";
import { category, condition } from "./schema";

/** Guest-facing list: projection only, no owner, condition or status (SPEC 5, AC2). */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").collect();
    return tools
      .filter((t) => t.status === "available" && t.removedAt === undefined)
      .map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const lookups = makeLookups(ctx);
    const tools = await ctx.db.query("tools").order("desc").collect();
    const visible = tools.filter(
      (t) => t.removedAt === undefined && (!args.category || t.category === args.category),
    );
    return await Promise.all(
      visible.map(async (t) => {
        const owner = await lookups.person(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          status: t.status,
          ownerName: owner.name,
          ownerTrusted: owner.trusted,
          isMine: t.ownerId === me._id,
        };
      }),
    );
  },
});

/** "My listings": each tool carries its open requests so the owner can act per tool. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const lookups = makeLookups(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(
      tools.filter((t) => t.removedAt === undefined).map(async (t) => {
        const loans = await ctx.db
          .query("loans")
          .withIndex("by_tool", (q) => q.eq("toolId", t._id))
          .collect();
        const open = loans.filter((l) => l.status === "pending" || l.status === "approved");
        const requests = await Promise.all(
          open.map(async (l) => {
            const borrower = await lookups.person(l.borrowerId);
            return {
              status: l.status,
              startDate: l.startDate,
              endDate: l.endDate,
              borrowerName: borrower.name,
            };
          }),
        );
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          status: t.status,
          pendingCount: open.filter((l) => l.status === "pending").length,
          requests,
        };
      }),
    );
  },
});

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      name: cleanToolName(args.name),
      category: args.category,
      condition: args.condition,
      description: cleanDescription(args.description),
      status: "available",
      createdAt: Date.now(),
    });
  },
});

/** Owners only, admins included: moderation goes through admin.removeListing instead. */
async function loadOwnTool(ctx: MutationCtx, toolId: Id<"tools">, me: Doc<"users">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "Tool not found.");
  if (tool.ownerId !== me._id) throw appError("FORBIDDEN", "You can only change your own tools.");
  return tool;
}

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.optional(v.string()),
    category: v.optional(category),
    condition: v.optional(condition),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await loadOwnTool(ctx, args.toolId, me);
    const patch: Partial<Pick<Doc<"tools">, "name" | "category" | "condition" | "description">> = {};
    if (args.name !== undefined) patch.name = cleanToolName(args.name);
    if (args.description !== undefined) patch.description = cleanDescription(args.description);
    if (args.category !== undefined) patch.category = args.category;
    if (args.condition !== undefined) patch.condition = args.condition;
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.toolId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tool = await loadOwnTool(ctx, args.toolId, me);
    // An owner must not strand a borrower mid-loan; mark it returned first.
    if (tool.status === "on_loan") throw appError("CONFLICT", "Tool is on loan; mark it returned first.");
    await softRemoveTool(ctx, tool);
    return null;
  },
});

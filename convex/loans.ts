import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { daysBetween, isIsoDate, rangesOverlap, todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";
import { queueLoanEvent } from "./lib/events";
import { loanActivity, makeLookups } from "./lib/views";

/** endDate - startDate may be at most this many days (start + 30 is allowed). */
export const MAX_LOAN_DAYS = 30;

function checkDates(startDate: string, endDate: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw appError("INVALID", "Dates must be real dates in YYYY-MM-DD format.");
  }
  if (startDate < todayUtc()) throw appError("INVALID", "Start date cannot be in the past.");
  if (endDate < startDate) throw appError("INVALID", "End date must be on or after the start date.");
  if (daysBetween(startDate, endDate) > MAX_LOAN_DAYS) {
    throw appError("INVALID", `A loan can last at most ${MAX_LOAN_DAYS} days.`);
  }
}

type Party = "borrower" | "lender";

/** Loads a loan and checks the caller's side; FORBIDDEN never says whose loan it is. */
async function loadLoanAs(ctx: MutationCtx, loanId: Id<"loans">, me: Doc<"users">, party: Party) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "Request not found.");
  const ownerId = party === "borrower" ? loan.borrowerId : loan.lenderId;
  if (ownerId !== me._id) throw appError("FORBIDDEN", `Only the ${party} can do this.`);
  return loan;
}

function requireStatus(loan: Doc<"loans">, expected: Doc<"loans">["status"]): void {
  if (loan.status !== expected) {
    throw appError("INVALID", `This request is ${loan.status}; it must be ${expected}.`);
  }
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    // Removed tools look absent to everyone but admins (R6).
    if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "Tool not found.");
    if (tool.ownerId === me._id) throw appError("FORBIDDEN", "You cannot borrow your own tool.");
    checkDates(args.startDate, args.endDate);

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      borrowerId: me._id,
      lenderId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      createdAt: Date.now(),
    });
    await queueLoanEvent(ctx, loanId, "loan.requested");
    return loanId;
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await loadLoanAs(ctx, args.loanId, me, "borrower");
    requireStatus(loan, "pending");
    await ctx.db.patch(loan._id, { status: "cancelled" });
    await queueLoanEvent(ctx, loan._id, "loan.cancelled");
    return null;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await loadLoanAs(ctx, args.loanId, me, "lender");
    requireStatus(loan, "pending");
    // R2 is re-checked here: a request left pending past its start date would otherwise
    // become an approved loan that is already running, or already overdue.
    if (loan.startDate < todayUtc()) {
      throw appError("INVALID", "This request's start date has passed. Decline it instead.");
    }

    const others = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .collect();
    const clash = others.some(
      (o) =>
        o.status === "approved" && rangesOverlap(loan.startDate, loan.endDate, o.startDate, o.endDate),
    );
    if (clash) throw appError("CONFLICT", "These dates overlap a loan you already approved.");

    await ctx.db.patch(loan._id, { status: "approved", decidedAt: Date.now() });
    // R4 decision: on_loan from approval, whatever the start date.
    await ctx.db.patch(loan.toolId, { status: "on_loan" });
    await queueLoanEvent(ctx, loan._id, "loan.approved");
    return null;
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await loadLoanAs(ctx, args.loanId, me, "lender");
    requireStatus(loan, "pending");
    await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
    await queueLoanEvent(ctx, loan._id, "loan.declined");
    return null;
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await loadLoanAs(ctx, args.loanId, me, "lender");
    requireStatus(loan, "approved");
    await ctx.db.patch(loan._id, { status: "returned", returnedAt: Date.now() });

    // Another future approval still holds the tool (R4 sets on_loan at approval time).
    const stillBooked = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();
    if (!stillBooked) await ctx.db.patch(loan.toolId, { status: "available" });
    await queueLoanEvent(ctx, loan._id, "loan.returned");
    return null;
  },
});

/** Requests I made, with automation activity for "/my/requests" (AC19). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const lookups = makeLookups(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(
      loans.map(async (l) => {
        const tool = await lookups.tool(l.toolId);
        const lender = await lookups.person(l.lenderId);
        return {
          _id: l._id,
          toolId: l.toolId,
          toolName: tool?.name ?? "Removed tool",
          toolRemoved: !tool || tool.removedAt !== undefined,
          lenderName: lender.name,
          lenderTrusted: lender.trusted,
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          createdAt: l.createdAt,
          decidedAt: l.decidedAt,
          returnedAt: l.returnedAt,
          activity: await loanActivity(ctx, l._id),
        };
      }),
    );
  },
});

/** Requests on my tools, for "/my/incoming". */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const lookups = makeLookups(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(
      loans.map(async (l) => {
        const tool = await lookups.tool(l.toolId);
        const borrower = await lookups.person(l.borrowerId);
        return {
          _id: l._id,
          toolId: l.toolId,
          toolName: tool?.name ?? "Removed tool",
          toolRemoved: !tool || tool.removedAt !== undefined,
          borrowerName: borrower.name,
          borrowerTrusted: borrower.trusted,
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          createdAt: l.createdAt,
          decidedAt: l.decidedAt,
          returnedAt: l.returnedAt,
          activity: await loanActivity(ctx, l._id),
        };
      }),
    );
  },
});

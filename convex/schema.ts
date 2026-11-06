import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Mirrors SPEC.md section 2. Validators for enums are exported so functions reuse them.
export const role = v.union(v.literal("admin"), v.literal("user"));
export const category = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);
export const condition = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export const toolStatus = v.union(v.literal("available"), v.literal("on_loan"));
export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);
export const eventKind = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);
export const eventStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role,
    trustedLender: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    status: toolStatus,
    removedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_endDate", ["status", "endDate"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: eventKind,
    idempotencyKey: v.string(),
    status: eventStatus,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_loan", ["loanId"])
    .index("by_key", ["idempotencyKey"]),
});

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

type AnyCtx = QueryCtx | MutationCtx;
type Identity = { name?: string; email?: string };

/**
 * Display name from the Clerk identity. Accounts created without a name (e.g. Clerk test
 * sign-ups) fall back to the email's local part without any +tag ("lender+clerk_test@..."
 * becomes "Lender"), so two unnamed neighbours are still told apart in the UI.
 */
export function displayName(identity: Identity): string {
  const name = identity.name?.trim();
  if (name) return name;
  const local = (identity.email ?? "").split("@")[0].split("+")[0].replace(/[._-]+/g, " ").trim();
  if (!local) return "Neighbour";
  return local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80);
}

function isMutationCtx(ctx: AnyCtx): ctx is MutationCtx {
  return "scheduler" in ctx && "insert" in ctx.db;
}

/**
 * First line of every non-public handler. Queries cannot write, so a signed-in caller
 * whose row does not exist yet is UNAUTHENTICATED there; mutations create the row
 * (role "user") so a brand-new account can act immediately. Role always comes from
 * the stored row, never from identity claims or arguments.
 */
export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (existing) return existing;

  if (!isMutationCtx(ctx)) throw appError("UNAUTHENTICATED", "Account not set up yet.");

  const userId = await ctx.db.insert("users", {
    clerkId: identity.subject,
    name: displayName(identity),
    email: identity.email ?? "",
    role: "user",
    trustedLender: false,
  });
  const created = await ctx.db.get(userId);
  if (!created) throw appError("UNAUTHENTICATED", "Account not set up yet.");
  return created;
}

export async function requireAdmin(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
  return user;
}

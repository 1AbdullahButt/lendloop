import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { displayName, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { isValidTimeZone } from "./lib/zones";
import { role } from "./schema";

/** Read at call time so a changed env var applies without a redeploy. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Called by the client once after sign-in. Creates the row on first call, keeps the
 * display name and email in step with Clerk, and promotes ADMIN_EMAILS. It never
 * demotes, so trimming the list can't silently lock out a working admin.
 */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const patch: { name?: string; email?: string; role?: "admin" } = {};
    // Only refresh the name when the token actually carries a name or email; a token
    // without either must not overwrite a good name with the "Neighbour" fallback.
    if (identity && (identity.name?.trim() || identity.email)) {
      const name = displayName(identity);
      if (name !== user.name) patch.name = name;
    }
    if (identity?.email && identity.email !== user.email) patch.email = identity.email;
    const email = (patch.email ?? user.email).toLowerCase();
    // Clerk's Convex JWT template carries email_verified (identity.emailVerified). An
    // address someone typed but never proved must not grant admin. Only an explicit
    // `false` blocks, so identities whose token omits the claim behave as before.
    const unverified = identity?.emailVerified === false;
    if (user.role !== "admin" && email && !unverified && adminEmails().includes(email)) {
      patch.role = "admin";
    }

    if (Object.keys(patch).length > 0) await ctx.db.patch(user._id, patch);
    return (await ctx.db.get(user._id))!;
  },
});

/**
 * The caller's time zone, an IANA name. The client sets it to the browser's zone on first
 * sign-in, and the user can change it from the header menu. Only the caller's own row.
 */
export const setTimeZone = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const timeZone = args.timeZone.trim();
    if (!isValidTimeZone(timeZone)) {
      throw appError("INVALID", "Pick a time zone from the list, for example Asia/Karachi.");
    }
    if (user.timeZone !== timeZone) await ctx.db.patch(user._id, { timeZone });
    return timeZone;
  },
});

/** The caller's own row, trimmed to what the header, admin gate and time zone read. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { _id: user._id, name: user.name, role: user.role, timeZone: user.timeZone };
  },
});

/** Dashboard-only path to promote or demote (`npx convex run users:setRole`). */
export const setRole = internalMutation({
  args: { userId: v.id("users"), role },
  handler: async (ctx, { userId, role: newRole }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { role: newRole });
    return null;
  },
});

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { canSetTrustedLender } from "./lib/rbac";
import { forbid, requireUser, toActor } from "./lib/auth";

/** Creates the profile on first sign-in. Role is never client-supplied. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    const name = identity.givenName ?? identity.nickname ?? identity.name ?? "Neighbour";
    if (existing) {
      if (existing.name !== name) await ctx.db.patch(existing._id, { name });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      role: "user",
      trustedLender: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const u = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return u ? { id: u._id, name: u.name, role: u.role, trustedLender: u.trustedLender } : null;
  },
});

/** Admin only: list users so a lender can be marked as trusted. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    if (actor.role !== "admin") forbid();
    const users = await ctx.db.query("users").take(200);
    return users.map((u) => ({ id: u._id, name: u.name, role: u.role, trustedLender: u.trustedLender }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (!canSetTrustedLender(toActor(actor))) forbid("Only admins can mark trusted lenders.");
    await ctx.db.patch(args.userId, { trustedLender: args.trusted });
  },
});

/** CLI bootstrap: `npx convex run users:listInternal` then `users:setRole`. Not callable by clients. */
export const listInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").take(200)).map((u) => ({ id: u._id, name: u.name, role: u.role })),
});

export const setRole = internalMutation({
  args: { userId: v.id("users"), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

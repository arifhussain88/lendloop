import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Actor } from "./rbac";

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError("Profile not initialised. Sign in again.");
  return user;
}

export const toActor = (u: Doc<"users">): Actor => ({ id: u._id, role: u.role });

export function forbid(message = "You are not allowed to do that."): never {
  throw new ConvexError(message);
}

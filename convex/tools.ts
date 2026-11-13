import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { categoryValidator } from "./schema";
import { forbid, requireUser, toActor } from "./lib/auth";
import { canEditTool, canRemoveTool } from "./lib/rbac";

const conditionValidator = v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn"));

async function isOnLoan(ctx: QueryCtx, toolId: Doc<"tools">["_id"]) {
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
  return {
    onLoan: loans.some((l) => l.status === "approved" && l.returnedAt === undefined),
    pending: loans.filter((l) => l.status === "pending").length,
  };
}

function cleanText(s: string, max: number, label: string) {
  const t = s.trim();
  if (!t) throw new ConvexError(`${label} is required.`);
  if (t.length > max) throw new ConvexError(`${label} must be at most ${max} characters.`);
  return t;
}

/** Public: name and category only. No owner details, ids of users, or descriptions. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").take(100);
    const out: { id: string; name: string; category: string }[] = [];
    for (const t of tools) {
      if (!(await isOnLoan(ctx, t._id)).onLoan) out.push({ id: t._id, name: t.name, category: t.category });
    }
    return out;
  },
});

/** Signed-in users: all tools with availability. */
export const listAll = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const category = args.category;
    const tools = category
      ? await ctx.db.query("tools").collect().then((all) => all.filter((t) => t.category === category))
      : await ctx.db.query("tools").order("desc").take(200);
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        const { onLoan, pending } = await isOnLoan(ctx, t._id);
        return {
          ...t,
          ownerName: owner?.name ?? "Unknown",
          ownerTrusted: owner?.trustedLender ?? false,
          availability: onLoan ? ("on loan" as const) : ("available" as const),
          pendingRequests: pending,
        };
      }),
    );
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    return await Promise.all(
      tools.map(async (t) => ({ ...t, availability: (await isOnLoan(ctx, t._id)).onLoan ? "on loan" : "available" })),
    );
  },
});

export const create = mutation({
  args: { name: v.string(), category: categoryValidator, condition: conditionValidator, description: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name: cleanText(args.name, 80, "Name"),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, 400, "Description"),
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw new ConvexError("Tool not found.");
    if (!canEditTool(toActor(user), tool)) forbid("You can only edit your own listings.");
    await ctx.db.patch(args.toolId, {
      name: cleanText(args.name, 80, "Name"),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, 400, "Description"),
    });
  },
});

/** Owner deletes own listing; admin can remove any. Open requests/loans are cancelled. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw new ConvexError("Tool not found.");
    if (!canRemoveTool(toActor(user), tool)) forbid("You can only delete your own listings.");
    const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", args.toolId)).collect();
    for (const l of loans) {
      if (l.status === "pending" || (l.status === "approved" && l.returnedAt === undefined)) {
        await ctx.db.patch(l._id, { status: "cancelled" });
      }
    }
    await ctx.db.delete(args.toolId);
  },
});

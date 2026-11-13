import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { forbid, requireUser, toActor } from "./lib/auth";
import {
  buildNotificationPayload,
  daysBetween,
  isOverdue,
  rangesOverlap,
  reminderKey,
  todayISO,
  validateDateRange,
} from "./lib/loans";
import { canDecideLoan, canMarkReturned, canRequestToBorrow, canViewAllLoans } from "./lib/rbac";

async function hasApprovedOverlap(ctx: QueryCtx, toolId: Doc<"tools">["_id"], range: { startDate: string; endDate: string }, excludeId?: Doc<"loans">["_id"]) {
  const loans = await ctx.db.query("loans").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect();
  return loans.some(
    (l) => l._id !== excludeId && l.status === "approved" && l.returnedAt === undefined && rangesOverlap(l, range),
  );
}

/** Enrich loans for display. Names only; activity limited to the latest events. */
async function enrich(ctx: QueryCtx, loans: Doc<"loans">[]) {
  return await Promise.all(
    loans.map(async (l) => {
      const [tool, owner, borrower, events] = await Promise.all([
        ctx.db.get(l.toolId),
        ctx.db.get(l.ownerId),
        ctx.db.get(l.borrowerId),
        ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", l._id)).order("desc").take(3),
      ]);
      return {
        ...l,
        toolName: tool?.name ?? "(removed listing)",
        ownerName: owner?.name ?? "Unknown",
        borrowerName: borrower?.name ?? "Unknown",
        activity: events.map((e) => ({ kind: e.kind, status: e.status, detail: e.detail, at: e._creationTime })),
      };
    }),
  );
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw new ConvexError("Tool not found.");
    if (!canRequestToBorrow(toActor(user), tool)) forbid("You cannot borrow your own tool.");
    const err = validateDateRange(args.startDate, args.endDate, todayISO());
    if (err) throw new ConvexError(err);
    if (await hasApprovedOverlap(ctx, tool._id, args)) throw new ConvexError("Those dates are already booked.");
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.automation.sendStatusWebhook, { loanId, status: "pending" });
    return loanId;
  },
});

export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Request not found.");
    if (!canDecideLoan(toActor(user), loan)) forbid("Only the lender can decide on a pending request.");
    if (args.approve && (await hasApprovedOverlap(ctx, loan.toolId, loan, loan._id)))
      throw new ConvexError("Those dates overlap an approved loan.");
    const status = args.approve ? "approved" : "declined";
    await ctx.db.patch(loan._id, { status });
    await ctx.scheduler.runAfter(0, internal.automation.sendStatusWebhook, { loanId: loan._id, status });
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Loan not found.");
    if (!canMarkReturned(toActor(user), loan)) forbid("Only the lender can mark an approved loan as returned.");
    await ctx.db.patch(loan._id, { status: "returned", returnedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.automation.sendStatusWebhook, { loanId: loan._id, status: "returned" });
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).order("desc").take(100);
    return enrich(ctx, loans);
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db.query("loans").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).order("desc").take(100);
    return enrich(ctx, loans);
  },
});

/** Admin only. */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!canViewAllLoans(toActor(user))) forbid("Admins only.");
    return enrich(ctx, await ctx.db.query("loans").order("desc").take(200));
  },
});

/** Internal: minimal payload for the n8n notification webhook. */
export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans"), status: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;
    const [tool, owner, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.ownerId), ctx.db.get(loan.borrowerId)]);
    return buildNotificationPayload({
      loanId: loan._id,
      status: args.status as Doc<"loans">["status"],
      toolName: tool?.name ?? "a tool",
      ownerName: owner?.name ?? "Lender",
      borrowerName: borrower?.name ?? "Borrower",
      startDate: loan.startDate,
      endDate: loan.endDate,
    });
  },
});

/** Internal: overdue loans that have not yet been reminded today (idempotent across retries). */
export const overdueForReminders = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const approved = await ctx.db.query("loans").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    const out: {
      loanId: string;
      idempotencyKey: string;
      toolName: string;
      borrowerName: string;
      endDate: string;
      daysOverdue: number;
    }[] = [];
    for (const l of approved) {
      if (!isOverdue(l, args.today)) continue;
      const key = reminderKey(l._id, args.today);
      const done = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("idempotencyKey", key)).unique();
      if (done?.status === "sent") continue;
      const [tool, borrower] = await Promise.all([ctx.db.get(l.toolId), ctx.db.get(l.borrowerId)]);
      out.push({
        loanId: l._id,
        idempotencyKey: key,
        toolName: tool?.name ?? "a tool",
        borrowerName: borrower?.name ?? "Borrower",
        endDate: l.endDate,
        daysOverdue: daysBetween(l.endDate, args.today),
      });
    }
    return out;
  },
});

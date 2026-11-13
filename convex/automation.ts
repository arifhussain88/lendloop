import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { signBody, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import { notificationKey, planEventWrite } from "./lib/loans";
import type { LoanStatus } from "./lib/rbac";

const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Idempotent write-back. Same key twice => no duplicate row.
 * A "sent" report may upgrade an earlier "failed" for the same key.
 */
export const recordEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    kind: v.union(v.literal("status_notification"), v.literal("overdue_reminder"), v.literal("workflow_error")),
    loanId: v.optional(v.id("loans")),
    status: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    const decision = planEventWrite(existing, args.status);
    if (decision === "insert") {
      await ctx.db.insert("automationEvents", args);
    } else if (decision === "update" && existing) {
      await ctx.db.patch(existing._id, { status: args.status, detail: args.detail });
    }
    return { decision };
  },
});

/**
 * Sends a signed webhook to n8n with bounded exponential-backoff retries.
 * Exhausted retries are recorded as a failed automation event so they are visible in the app.
 * The idempotency key is stable across retries so n8n/Convex can de-duplicate.
 */
export const sendStatusWebhook = internalAction({
  args: { loanId: v.id("loans"), status: v.string() },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.loans.notificationPayload, args);
    if (!payload) return;
    const key = notificationKey(args.loanId, args.status as LoanStatus);
    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_HMAC_SECRET;
    const fail = (detail: string) =>
      ctx.runMutation(internal.automation.recordEvent, {
        idempotencyKey: key,
        kind: "status_notification",
        loanId: args.loanId,
        status: "failed",
        detail,
      });

    if (!url || !secret) {
      console.error("[automation] N8N_WEBHOOK_URL or LENDLOOP_HMAC_SECRET not configured");
      await fail("Automation not configured");
      return;
    }

    const body = JSON.stringify(payload);
    let lastError = "unknown error";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { timestamp, signature } = await signBody(secret, body);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [TIMESTAMP_HEADER]: timestamp,
            [SIGNATURE_HEADER]: signature,
            "x-idempotency-key": key,
          },
          body,
        });
        if (res.ok) return;
        lastError = `n8n responded ${res.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      console.warn(`[automation] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError}`);
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    console.error(`[automation] giving up on ${key}: ${lastError}`);
    await fail(`Webhook failed after ${MAX_ATTEMPTS} attempts: ${lastError}`.slice(0, 500));
  },
});

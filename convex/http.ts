import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "./lib/hmac";
import { parseWriteBack, todayISO } from "./lib/loans";

const http = httpRouter();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function authenticate(req: Request, body: string) {
  return verifySignature({
    secret: process.env.LENDLOOP_HMAC_SECRET,
    body,
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
  });
}

/** n8n (daily schedule) fetches overdue loans. Signature covers the timestamp and an empty body. */
http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(req, "");
    if (!auth.ok) {
      console.warn(`[http] rejected overdue-loans request: ${auth.reason}`);
      return json({ error: "unauthorized" }, 401);
    }
    const loans = await ctx.runQuery(internal.loans.overdueForReminders, { today: todayISO() });
    return json({ loans });
  }),
});

/** n8n writes back notification/reminder/error results. Idempotent on idempotencyKey. */
http.route({
  path: "/n8n/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    const auth = await authenticate(req, raw);
    if (!auth.ok) {
      console.warn(`[http] rejected automation-events request: ${auth.reason}`);
      return json({ error: "unauthorized" }, 401);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const body = parseWriteBack(parsed);
    if (!body.ok) return json({ error: body.error }, 400);
    try {
      const result = await ctx.runMutation(internal.automation.recordEvent, {
        ...body.value,
        loanId: body.value.loanId as Id<"loans"> | undefined,
      });
      return json({ ok: true, ...result });
    } catch (e) {
      console.error("[http] recordEvent failed", e);
      return json({ error: "invalid_request" }, 400);
    }
  }),
});

export default http;

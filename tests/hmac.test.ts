import { describe, expect, it } from "vitest";
import { signBody, timingSafeEqual, verifySignature } from "../convex/lib/hmac";

const secret = "test-secret";
const body = JSON.stringify({ loanId: "abc", status: "approved" });
const now = 1_700_000_000_000;

describe("HMAC verification", () => {
  it("accepts a correctly signed body", async () => {
    const { timestamp, signature } = await signBody(secret, body, now);
    expect(await verifySignature({ secret, body, timestamp, signature, nowMs: now })).toEqual({ ok: true });
  });
  it("rejects a tampered body", async () => {
    const { timestamp, signature } = await signBody(secret, body, now);
    const r = await verifySignature({ secret, body: body + " ", timestamp, signature, nowMs: now });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects a wrong secret", async () => {
    const { timestamp, signature } = await signBody("other", body, now);
    expect((await verifySignature({ secret, body, timestamp, signature, nowMs: now })).ok).toBe(false);
  });
  it("rejects stale timestamps (replay)", async () => {
    const { timestamp, signature } = await signBody(secret, body, now);
    const r = await verifySignature({ secret, body, timestamp, signature, nowMs: now + 10 * 60_000 });
    expect(r).toEqual({ ok: false, reason: "stale_timestamp" });
  });
  it("rejects missing headers and missing secret", async () => {
    expect(await verifySignature({ secret, body, timestamp: null, signature: null, nowMs: now })).toEqual({ ok: false, reason: "missing_headers" });
    const { timestamp, signature } = await signBody(secret, body, now);
    expect(await verifySignature({ secret: undefined, body, timestamp, signature, nowMs: now })).toEqual({ ok: false, reason: "secret_not_configured" });
  });
  it("signs an empty body (GET)", async () => {
    const { timestamp, signature } = await signBody(secret, "", now);
    expect((await verifySignature({ secret, body: "", timestamp, signature, nowMs: now })).ok).toBe(true);
  });
  it("timingSafeEqual compares correctly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});

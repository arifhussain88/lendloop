/**
 * HMAC-SHA256 request signing shared by Convex (sender + receiver) and mirrored in the n8n workflows.
 *
 * Signed string: `${timestampSeconds}.${rawBody}`
 * Headers:       X-LendLoop-Timestamp, X-LendLoop-Signature ("sha256=<hex>")
 * Uses Web Crypto only, so it runs in the Convex runtime, Node 18+ and Vitest.
 */
const encoder = new TextEncoder();

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signBody(
  secret: string,
  body: string,
  nowMs: number = Date.now(),
): Promise<{ timestamp: string; signature: string }> {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`;
  return { timestamp, signature };
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifySignature(params: {
  secret: string | undefined;
  body: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, body, timestamp, signature } = params;
  const nowMs = params.nowMs ?? Date.now();
  const tolerance = params.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (!secret) return { ok: false, reason: "secret_not_configured" };
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(nowMs / 1000 - ts) > tolerance) return { ok: false, reason: "stale_timestamp" };

  const expected = `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`;
  return timingSafeEqual(signature, expected) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

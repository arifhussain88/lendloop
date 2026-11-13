/** Pure loan/automation helpers (dates, overlap, idempotency keys, minimal payloads). */
import type { LoanStatus } from "./rbac";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const todayISO = (nowMs: number = Date.now()) => new Date(nowMs).toISOString().slice(0, 10);

export function isValidISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Returns an error message, or null when valid. ISO dates compare lexicographically. */
export function validateDateRange(start: string, end: string, today: string): string | null {
  if (!isValidISODate(start) || !isValidISODate(end)) return "Dates must be valid YYYY-MM-DD values.";
  if (start < today) return "Start date cannot be in the past.";
  if (end < start) return "End date must be on or after the start date.";
  return null;
}

export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function isOverdue(
  loan: { status: LoanStatus; endDate: string; returnedAt?: number },
  today: string,
): boolean {
  return loan.status === "approved" && loan.returnedAt === undefined && loan.endDate < today;
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** One notification per (loan, status). Retries reuse the same key. */
export const notificationKey = (loanId: string, status: LoanStatus) => `notify:${loanId}:${status}`;
/** One reminder per loan per day. */
export const reminderKey = (loanId: string, day: string) => `reminder:${loanId}:${day}`;

export type EventStatus = "sent" | "failed";
export type WriteDecision = "insert" | "update" | "noop";

/**
 * Idempotent write-back rule: first write inserts; repeats are no-ops;
 * a later "sent" may upgrade an earlier "failed" for the same key.
 */
export function planEventWrite(existing: { status: EventStatus } | null, incoming: EventStatus): WriteDecision {
  if (!existing) return "insert";
  if (existing.status === "failed" && incoming === "sent") return "update";
  return "noop";
}

/** Who is told about a status change. */
export function recipientRoleFor(status: LoanStatus): "owner" | "borrower" | null {
  switch (status) {
    case "pending":
    case "returned":
      return "owner";
    case "approved":
    case "declined":
      return "borrower";
    default:
      return null;
  }
}

export interface NotificationPayload {
  event: "loan.status_changed";
  idempotencyKey: string;
  loanId: string;
  status: LoanStatus;
  tool: { name: string };
  recipient: { name: string; role: "owner" | "borrower" };
  dates: { start: string; end: string };
}

/** Only the fields n8n needs: no emails, ids of users, descriptions or conditions. */
export function buildNotificationPayload(input: {
  loanId: string;
  status: LoanStatus;
  toolName: string;
  ownerName: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
}): NotificationPayload | null {
  const role = recipientRoleFor(input.status);
  if (!role) return null;
  return {
    event: "loan.status_changed",
    idempotencyKey: notificationKey(input.loanId, input.status),
    loanId: input.loanId,
    status: input.status,
    tool: { name: input.toolName },
    recipient: { name: role === "owner" ? input.ownerName : input.borrowerName, role },
    dates: { start: input.startDate, end: input.endDate },
  };
}

export const EVENT_KINDS = ["status_notification", "overdue_reminder", "workflow_error"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface WriteBackBody {
  kind: EventKind;
  idempotencyKey: string;
  loanId?: string;
  status: EventStatus;
  detail?: string;
}

/** Validates an n8n write-back body. Returns the cleaned body or an error string. */
export function parseWriteBack(raw: unknown): { ok: true; value: WriteBackBody } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "body_not_object" };
  const r = raw as Record<string, unknown>;
  if (!EVENT_KINDS.includes(r.kind as EventKind)) return { ok: false, error: "bad_kind" };
  if (typeof r.idempotencyKey !== "string" || r.idempotencyKey.length < 3 || r.idempotencyKey.length > 200)
    return { ok: false, error: "bad_idempotency_key" };
  if (r.status !== "sent" && r.status !== "failed") return { ok: false, error: "bad_status" };
  if (r.loanId !== undefined && typeof r.loanId !== "string") return { ok: false, error: "bad_loan_id" };
  if (r.detail !== undefined && typeof r.detail !== "string") return { ok: false, error: "bad_detail" };
  const kind = r.kind as EventKind;
  const key = r.idempotencyKey;
  const loanId = r.loanId as string | undefined;
  if (kind === "overdue_reminder" && (!loanId || !key.startsWith(`reminder:${loanId}:`)))
    return { ok: false, error: "key_loan_mismatch" };
  if (kind === "status_notification" && (!loanId || !key.startsWith(`notify:${loanId}:`)))
    return { ok: false, error: "key_loan_mismatch" };
  return {
    ok: true,
    value: { kind, idempotencyKey: key, loanId, status: r.status, detail: (r.detail as string | undefined)?.slice(0, 500) },
  };
}

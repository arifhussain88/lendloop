import { describe, expect, it } from "vitest";
import {
  buildNotificationPayload, isOverdue, notificationKey, parseWriteBack, planEventWrite,
  rangesOverlap, reminderKey, validateDateRange,
} from "../convex/lib/loans";

describe("idempotent write-backs", () => {
  it("inserts first, then no-ops on duplicates", () => {
    expect(planEventWrite(null, "sent")).toBe("insert");
    expect(planEventWrite({ status: "sent" }, "sent")).toBe("noop");
    expect(planEventWrite({ status: "sent" }, "failed")).toBe("noop");
    expect(planEventWrite({ status: "failed" }, "failed")).toBe("noop");
  });
  it("upgrades failed to sent once", () => {
    expect(planEventWrite({ status: "failed" }, "sent")).toBe("update");
  });
  it("reminder key is stable per loan per day", () => {
    expect(reminderKey("L1", "2026-11-12")).toBe(reminderKey("L1", "2026-11-12"));
    expect(reminderKey("L1", "2026-11-12")).not.toBe(reminderKey("L1", "2026-11-13"));
    expect(notificationKey("L1", "approved")).toBe("notify:L1:approved");
  });
  it("write-back parsing enforces key/loan binding", () => {
    const ok = parseWriteBack({ kind: "overdue_reminder", idempotencyKey: "reminder:L1:2026-11-12", loanId: "L1", status: "sent" });
    expect(ok.ok).toBe(true);
    const bad = parseWriteBack({ kind: "overdue_reminder", idempotencyKey: "reminder:L2:2026-11-12", loanId: "L1", status: "sent" });
    expect(bad).toEqual({ ok: false, error: "key_loan_mismatch" });
    expect(parseWriteBack({ kind: "nope" }).ok).toBe(false);
    expect(parseWriteBack({ kind: "workflow_error", idempotencyKey: "error:42", status: "failed" }).ok).toBe(true);
  });
});

describe("loan rules", () => {
  it("validates date ranges", () => {
    expect(validateDateRange("2026-11-13", "2026-11-15", "2026-11-12")).toBeNull();
    expect(validateDateRange("2026-11-10", "2026-11-15", "2026-11-12")).toMatch(/past/);
    expect(validateDateRange("2026-11-15", "2026-11-13", "2026-11-12")).toMatch(/End date/);
    expect(validateDateRange("2026-02-30", "2026-03-01", "2026-01-01")).toMatch(/valid/);
  });
  it("detects overlaps", () => {
    expect(rangesOverlap({ startDate: "2026-11-01", endDate: "2026-11-05" }, { startDate: "2026-11-05", endDate: "2026-11-08" })).toBe(true);
    expect(rangesOverlap({ startDate: "2026-11-01", endDate: "2026-11-05" }, { startDate: "2026-11-06", endDate: "2026-11-08" })).toBe(false);
  });
  it("overdue only for approved, unreturned, past due", () => {
    expect(isOverdue({ status: "approved", endDate: "2026-11-10" }, "2026-11-12")).toBe(true);
    expect(isOverdue({ status: "approved", endDate: "2026-11-12" }, "2026-11-12")).toBe(false);
    expect(isOverdue({ status: "returned", endDate: "2026-11-10", returnedAt: 1 }, "2026-11-12")).toBe(false);
    expect(isOverdue({ status: "pending", endDate: "2026-11-10" }, "2026-11-12")).toBe(false);
  });
  it("notification payload is minimal and routed to the right person", () => {
    const base = { loanId: "L1", toolName: "Drill", ownerName: "Olive", borrowerName: "Bo", startDate: "2026-11-13", endDate: "2026-11-14" };
    const pending = buildNotificationPayload({ ...base, status: "pending" });
    expect(pending?.recipient).toEqual({ name: "Olive", role: "owner" });
    expect(buildNotificationPayload({ ...base, status: "approved" })?.recipient.name).toBe("Bo");
    expect(buildNotificationPayload({ ...base, status: "cancelled" })).toBeNull();
    expect(Object.keys(pending!).sort()).toEqual(["dates", "event", "idempotencyKey", "loanId", "recipient", "status", "tool"]);
  });
});

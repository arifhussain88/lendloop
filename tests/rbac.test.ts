import { describe, expect, it } from "vitest";
import {
  canDecideLoan, canEditTool, canMarkReturned, canRemoveTool, canRequestToBorrow,
  canSetTrustedLender, canViewAllLoans, canViewLoan, type Actor,
} from "../convex/lib/rbac";

const owner: Actor = { id: "u1", role: "user" };
const borrower: Actor = { id: "u2", role: "user" };
const stranger: Actor = { id: "u3", role: "user" };
const admin: Actor = { id: "a1", role: "admin" };
const tool = { ownerId: "u1" };
const loan = (status: "pending" | "approved" | "declined" | "returned") => ({ ownerId: "u1", borrowerId: "u2", status });

describe("RBAC", () => {
  it("only owners edit tools (not even admins)", () => {
    expect(canEditTool(owner, tool)).toBe(true);
    expect(canEditTool(stranger, tool)).toBe(false);
    expect(canEditTool(admin, tool)).toBe(false);
  });
  it("owners and admins can remove listings; others cannot", () => {
    expect(canRemoveTool(owner, tool)).toBe(true);
    expect(canRemoveTool(admin, tool)).toBe(true);
    expect(canRemoveTool(stranger, tool)).toBe(false);
  });
  it("cannot borrow your own tool", () => {
    expect(canRequestToBorrow(owner, tool)).toBe(false);
    expect(canRequestToBorrow(borrower, tool)).toBe(true);
  });
  it("only the lender decides pending requests", () => {
    expect(canDecideLoan(owner, loan("pending"))).toBe(true);
    expect(canDecideLoan(owner, loan("approved"))).toBe(false);
    expect(canDecideLoan(borrower, loan("pending"))).toBe(false);
    expect(canDecideLoan(admin, loan("pending"))).toBe(false);
  });
  it("only the lender marks approved loans returned", () => {
    expect(canMarkReturned(owner, loan("approved"))).toBe(true);
    expect(canMarkReturned(owner, loan("pending"))).toBe(false);
    expect(canMarkReturned(borrower, loan("approved"))).toBe(false);
  });
  it("loan visibility: parties and admins only", () => {
    expect(canViewLoan(owner, loan("approved"))).toBe(true);
    expect(canViewLoan(borrower, loan("approved"))).toBe(true);
    expect(canViewLoan(admin, loan("approved"))).toBe(true);
    expect(canViewLoan(stranger, loan("approved"))).toBe(false);
  });
  it("admin-only capabilities", () => {
    expect(canViewAllLoans(admin)).toBe(true);
    expect(canViewAllLoans(owner)).toBe(false);
    expect(canSetTrustedLender(admin)).toBe(true);
    expect(canSetTrustedLender(owner)).toBe(false);
  });
});

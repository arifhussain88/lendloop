/** Pure authorization rules. Convex functions call these; the UI only mirrors them for display. */
export type Role = "admin" | "user";
export type LoanStatus = "pending" | "approved" | "declined" | "returned" | "cancelled";

export interface Actor {
  id: string;
  role: Role;
}

export const isAdmin = (a: Actor) => a.role === "admin";

export const canEditTool = (a: Actor, tool: { ownerId: string }) => a.id === tool.ownerId;

/** Owners delete their own listings; admins can remove any listing. */
export const canRemoveTool = (a: Actor, tool: { ownerId: string }) =>
  isAdmin(a) || a.id === tool.ownerId;

export const canRequestToBorrow = (a: Actor, tool: { ownerId: string }) => a.id !== tool.ownerId;

/** Only the lender can approve/decline, and only while pending. */
export const canDecideLoan = (a: Actor, loan: { ownerId: string; status: LoanStatus }) =>
  a.id === loan.ownerId && loan.status === "pending";

/** Only the lender confirms the return, and only for approved loans. */
export const canMarkReturned = (a: Actor, loan: { ownerId: string; status: LoanStatus }) =>
  a.id === loan.ownerId && loan.status === "approved";

export const canViewLoan = (a: Actor, loan: { ownerId: string; borrowerId: string }) =>
  isAdmin(a) || a.id === loan.ownerId || a.id === loan.borrowerId;

export const canViewAllLoans = (a: Actor) => isAdmin(a);
export const canSetTrustedLender = (a: Actor) => isAdmin(a);

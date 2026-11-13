"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { activityLabel } from "@/lib/format";

const CATEGORIES = ["power tools", "garden", "kitchen", "camping", "other"] as const;
const CONDITIONS = ["new", "good", "fair", "worn"] as const;
type Category = (typeof CATEGORIES)[number];
type Tab = "browse" | "listings" | "requests" | "incoming" | "admin";

function errMsg(e: unknown) {
  return e instanceof ConvexError ? String(e.data) : "Something went wrong.";
}

export default function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("browse");

  useEffect(() => {
    if (isAuthenticated) store().then(() => setReady(true));
  }, [isAuthenticated, store]);

  const me = useQuery(api.users.me, ready ? {} : "skip");
  const tabs: [Tab, string][] = [
    ["browse", "Browse tools"],
    ["listings", "My listings"],
    ["requests", "My requests"],
    ["incoming", "Incoming requests"],
    ...(me?.role === "admin" ? ([["admin", "Admin"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="container">
      <header className="top">
        <Link className="logo" href="/">LendLoop</Link>
        <div className="row">
          {me && <span className="muted">{me.name}{me.role === "admin" ? " (admin)" : ""}</span>}
          <UserButton />
        </div>
      </header>
      {!ready || !me ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <nav className="tabs">
            {tabs.map(([id, label]) => (
              <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          {tab === "browse" && <Browse />}
          {tab === "listings" && <Listings />}
          {tab === "requests" && <Requests />}
          {tab === "incoming" && <Incoming />}
          {tab === "admin" && me.role === "admin" && <Admin />}
        </>
      )}
    </div>
  );
}

function Browse() {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.listAll, category ? { category } : {});
  const [openId, setOpenId] = useState<Id<"tools"> | null>(null);
  return (
    <>
      <div className="row">
        <label>Category{" "}
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        {tools?.map((t) => (
          <div className="card" key={t._id}>
            <h3>{t.name}</h3>
            <span className="badge">{t.category}</span>
            <span className={`badge ${t.availability === "on loan" ? "warn" : ""}`}>{t.availability}</span>
            <p className="muted">{t.condition} · {t.description}</p>
            <p className="muted">Lender: {t.ownerName}{t.ownerTrusted ? " ✓ Trusted Lender" : ""}</p>
            {openId === t._id ? (
              <RequestForm toolId={t._id} onDone={() => setOpenId(null)} />
            ) : (
              <button className="btn small" onClick={() => setOpenId(t._id)}>Request to borrow</button>
            )}
          </div>
        ))}
        {tools?.length === 0 && <p className="muted">No tools in this category.</p>}
      </div>
    </>
  );
}

function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try { await request({ toolId, startDate, endDate }); onDone(); } catch (err) { setError(errMsg(err)); }
      }}
    >
      <input type="date" required value={startDate} onChange={(e) => setStart(e.target.value)} />
      <input type="date" required value={endDate} onChange={(e) => setEnd(e.target.value)} />
      {error && <span className="error">{error}</span>}
      <div className="row">
        <button className="btn small" type="submit">Send request</button>
        <button className="btn small secondary" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function Listings() {
  const mine = useQuery(api.tools.listMine);
  const create = useMutation(api.tools.create);
  const remove = useMutation(api.tools.remove);
  const [form, setForm] = useState({ name: "", category: "power tools" as Category, condition: "good" as (typeof CONDITIONS)[number], description: "" });
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  return (
    <>
      <form
        className="stack card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await create(form);
            setForm({ ...form, name: "", description: "" });
            setError("");
          } catch (err) { setError(errMsg(err)); }
        }}
      >
        <strong>List a tool</strong>
        <input placeholder="Name" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as (typeof CONDITIONS)[number] })}>
          {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <textarea placeholder="Short description" required maxLength={400} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {error && <span className="error">{error}</span>}
        <button className="btn" type="submit">Add listing</button>
      </form>
      <div className="grid" style={{ marginTop: 16 }}>
        {mine?.map((t) => (
          <div className="card" key={t._id}>
            {editing === t._id ? (
              <EditTool tool={t} onDone={() => setEditing(null)} />
            ) : (
              <>
                <h3>{t.name}</h3>
                <span className="badge">{t.category}</span><span className="badge">{t.availability}</span>
                <p className="muted">{t.condition} · {t.description}</p>
                <div className="row">
                  <button className="btn small secondary" onClick={() => setEditing(t._id)}>Edit</button>
                  <button className="btn small danger" onClick={() => remove({ toolId: t._id })}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function EditTool({ tool, onDone }: { tool: { _id: Id<"tools">; name: string; category: Category; condition: (typeof CONDITIONS)[number]; description: string }; onDone: () => void }) {
  const update = useMutation(api.tools.update);
  const [f, setF] = useState({ name: tool.name, category: tool.category, condition: tool.condition, description: tool.description });
  const [error, setError] = useState("");
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await update({ toolId: tool._id, ...f }); onDone(); } catch (err) { setError(errMsg(err)); } }}>
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as (typeof CONDITIONS)[number] })}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      {error && <span className="error">{error}</span>}
      <div className="row"><button className="btn small" type="submit">Save</button><button className="btn small secondary" type="button" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

type LoanRow = {
  _id: Id<"loans">; toolName: string; ownerName: string; borrowerName: string; startDate: string; endDate: string;
  status: string; activity: { kind: string; status: string; at: number }[];
};

function LoanCard({ loan, perspective, children }: { loan: LoanRow; perspective: "borrower" | "owner" | "admin"; children?: React.ReactNode }) {
  return (
    <div className="card">
      <h3>{loan.toolName}</h3>
      <span className="badge">{loan.status}</span>
      <p className="muted">
        {loan.startDate} → {loan.endDate} ·{" "}
        {perspective === "borrower" ? `Lender: ${loan.ownerName}` : perspective === "owner" ? `Borrower: ${loan.borrowerName}` : `${loan.ownerName} → ${loan.borrowerName}`}
      </p>
      {loan.activity.map((a, i) => <p key={i} className="muted">• {activityLabel(a)}</p>)}
      {children}
    </div>
  );
}

function Requests() {
  const loans = useQuery(api.loans.myRequests);
  return <div className="grid">{loans?.map((l) => <LoanCard key={l._id} loan={l} perspective="borrower" />)}{loans?.length === 0 && <p className="muted">No requests yet.</p>}</div>;
}

function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); setError(""); } catch (e) { setError(errMsg(e)); } };
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {loans?.map((l) => (
          <LoanCard key={l._id} loan={l} perspective="owner">
            {l.status === "pending" && (
              <div className="row">
                <button className="btn small" onClick={() => run(() => decide({ loanId: l._id, approve: true }))}>Approve</button>
                <button className="btn small secondary" onClick={() => run(() => decide({ loanId: l._id, approve: false }))}>Decline</button>
              </div>
            )}
            {l.status === "approved" && (
              <div className="row"><button className="btn small" onClick={() => run(() => markReturned({ loanId: l._id }))}>Mark returned</button></div>
            )}
          </LoanCard>
        ))}
        {loans?.length === 0 && <p className="muted">No incoming requests.</p>}
      </div>
    </>
  );
}

function Admin() {
  const loans = useQuery(api.loans.listAllForAdmin);
  const users = useQuery(api.users.listForAdmin);
  const tools = useQuery(api.tools.listAll, {});
  const setTrusted = useMutation(api.users.setTrustedLender);
  const remove = useMutation(api.tools.remove);
  return (
    <>
      <h2>Lenders</h2>
      <div className="grid">
        {users?.map((u) => (
          <div className="card" key={u.id}>
            <h3>{u.name}</h3>
            <span className="badge">{u.role}</span>{u.trustedLender && <span className="badge">Trusted Lender</span>}
            <div className="row"><button className="btn small secondary" onClick={() => setTrusted({ userId: u.id, trusted: !u.trustedLender })}>{u.trustedLender ? "Remove trusted" : "Mark trusted"}</button></div>
          </div>
        ))}
      </div>
      <h2>All listings</h2>
      <div className="grid">
        {tools?.map((t) => (
          <div className="card" key={t._id}>
            <h3>{t.name}</h3><p className="muted">{t.ownerName}</p>
            <button className="btn small danger" onClick={() => remove({ toolId: t._id })}>Remove listing</button>
          </div>
        ))}
      </div>
      <h2>All loans</h2>
      <div className="grid">{loans?.map((l) => <LoanCard key={l._id} loan={l} perspective="admin" />)}</div>
    </>
  );
}

"use client";

import Link from "next/link";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const tools = useQuery(api.tools.listPublic);
  return (
    <div className="container">
      <header className="top">
        <span className="logo">LendLoop</span>
        <SignedIn>
          <div className="row">
            <Link className="btn small" href="/dashboard">Open dashboard</Link>
            <UserButton />
          </div>
        </SignedIn>
      </header>

      <section className="hero">
        <h1>Borrow what you need. Lend what you don&apos;t.</h1>
        <p>A neighborhood board for sharing tools, so nobody buys a drill for one shelf.</p>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn">Sign in to lend or borrow</button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link className="btn" href="/dashboard">Go to your dashboard</Link>
        </SignedIn>
      </section>

      <section>
        <h2>Available now</h2>
        {tools === undefined ? (
          <p className="muted">Loading…</p>
        ) : tools.length === 0 ? (
          <p className="muted">No tools listed yet.</p>
        ) : (
          <div className="grid">
            {tools.map((t) => (
              <div className="card" key={t.id}>
                <h3>{t.name}</h3>
                <span className="badge">{t.category}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <footer>© LendLoop. Neighbors sharing tools.</footer>
    </div>
  );
}

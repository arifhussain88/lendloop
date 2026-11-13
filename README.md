# LendLoop

Small neighborhood tool-lending board I built for the Fluence take-home.

Anyone can see what's available. Sign in if you want to list a tool, request one, or approve/decline requests. Admins can pull listings and mark someone as a Trusted Lender.

Stack is Next.js (App Router), Clerk, Convex, n8n, TypeScript. Tests with Vitest.

## How to run it

You'll need Node 20+, Docker (only for n8n), and free Clerk + Convex accounts.

```bash
cp .env.example .env.local
# fill in the keys — don't commit this file

npm install

# this logs you into Convex, creates a project, writes the URLs, and generates types
npx convex dev

# in another terminal
npm run seed    # a few demo tools, safe to re-run
npm run dev     # http://localhost:3000
```

In Clerk, add a JWT template named `convex` (there's a Convex preset). Copy the issuer domain into `.env.local` and also onto the Convex deployment:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set LENDLOOP_HMAC_SECRET "$(openssl rand -hex 32)"
```

Use the same HMAC secret in `.env.local`. To make yourself an admin after you sign in once:

```bash
npx convex run users:listInternal
npx convex run users:setRole '{"userId":"<id>","role":"admin"}'
```

Didn't put a role switcher in the UI on purpose — that should stay a server-side thing.

## n8n

```bash
docker compose --env-file .env.local up -d
# http://localhost:5678 — create the owner account, then import the json files in n8n/workflows/
# import error-handler.json first, then the other two, and hook them to the error workflow in Settings
```

Convex Cloud has to reach n8n, so locally you'll need a tunnel (`ngrok http 5678` or whatever you use). Set `N8N_WEBHOOK_URL` on Convex to `https://<tunnel>/webhook/lendloop-loan-events`, and `LENDLOOP_CONVEX_SITE_URL` in `.env.local` to your `https://<deployment>.convex.site` URL.

The workflow files don't have secrets in them; they read `$env.LENDLOOP_HMAC_SECRET` and `$env.LENDLOOP_CONVEX_SITE_URL`.

## Env vars

Mostly in `.env.example`. The ones that actually matter:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` (written by `convex dev`)
- `LENDLOOP_CONVEX_SITE_URL` — the `.convex.site` URL, used by n8n
- `LENDLOOP_HMAC_SECRET` — shared by Convex and n8n
- `N8N_WEBHOOK_URL` — public URL of the n8n webhook (Convex env)
- `N8N_ENCRYPTION_KEY`, `N8N_PUBLIC_URL` — docker-compose

## Tests

```bash
npm test
```

Just unit tests for HMAC, RBAC and the loan date/overlap rules. No live Clerk or Convex needed.

`npm run build` works once the generated Convex types are in place (`npx convex dev` does that; I also checked in a copy so a fresh clone typechecks).

## Notes / tradeoffs

- Authz is in the Convex functions, not just hidden buttons. Public page only returns tool name + category.
- Webhooks are HMAC-signed both ways (`timestamp.body`, 5 min replay window). Write-backs are idempotent (`notify:<loanId>:<status>`, `reminder:<loanId>:<day>`).
- Notifications are mocked (logged) rather than actually emailed. Felt like enough for a take-home and I didn't want to drag in a mail provider.
- I wrote the n8n JSON by hand against current node versions, so after import you may still need to attach the error workflow in the UI. I didn't run this against a live Clerk/Convex/n8n setup end-to-end.
- Due dates are UTC days, lists aren't paginated, and there's no real notification channel.

## What I'd do next

Wire a real email/SMS path, move roles onto Clerk metadata, add an audit log for admin actions, paginate the lists, and throw convex-test + a bit of Playwright in CI. If this were going to production I'd also run n8n with Postgres behind TLS and rotate the HMAC secret properly.

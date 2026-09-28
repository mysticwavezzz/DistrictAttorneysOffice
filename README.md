# District Attorney's Office — Public Website & Staff Portal

Public-facing website for a Roblox "ro-county" style District Attorney's
Office, plus a Roblox OAuth2-authenticated staff portal scaffolded for a
future case-management dashboard. Built as a companion site to an existing
`rocounty` government platform, matching its visual style.

**This is a Roblox roleplay community project.** Every page includes an
in-character disclaimer; nothing here represents a real government entity.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** — server-rendered public
  pages, API routes, and edge middleware in one codebase.
- **Auth.js (NextAuth v5)** with a hand-written Roblox OAuth2 provider —
  Auth.js's provider/callback architecture is built exactly for "add a
  custom OAuth provider, merge extra profile data into the session,"
  which is what a first-of-its-kind Roblox integration needs.
- **Prisma + SQLite** in development (swap `DATABASE_URL` and the
  `datasource` provider in `prisma/schema.prisma` for Postgres/MySQL in
  production).
- **Zod** for all input validation (env vars, form submissions).
- Plain CSS (no Tailwind) — the whole design system is one file
  (`src/app/globals.css`) of component classes (`.card`, `.pill`,
  `table.stat`, `.sbox`, …) matching the existing rocounty site family's
  look, plus a separate dark "portal" theme scoped to the login page.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
echo 'DATABASE_URL="file:./dev.db"' > .env   # Prisma CLI only reads .env, not .env.local
npx prisma db push
npm run db:seed              # optional: sample announcements + cases
npm run dev
```

### Required environment variables

See `.env.example` for the full list with comments. At minimum:

| Variable | Where it comes from |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET` | Roblox OAuth2 app at [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials). Redirect URI: `<your-url>/api/auth/callback/roblox`, scopes `openid profile`. |
| `DATABASE_URL` | `file:./dev.db` locally |
| `ROBLOX_LAW_ENFORCEMENT_GROUP_ID`, `ROBLOX_GOVERNMENT_GROUP_ID`, `ROBLOX_DA_GROUP_ID` | Numeric Roblox group IDs. Any tier whose group ID is left unset is simply disabled. |
| `GOOGLE_FORM_ACTION_URL`, `GOOGLE_FORM_ENTRY_DETAILS` (+ optional NAME/CONTACT/LOCATION) | From the Google Form's prefilled-link HTML — see below. |

**Note on the Roblox OAuth endpoints:** this was built without live access
to Roblox's developer docs from this environment. The endpoints in
`src/lib/roblox/provider.ts` (`https://apis.roblox.com/oauth/v1/*`) and
claim names reflect Roblox's documented OAuth 2.0/OIDC flow at the time of
writing — verify against
[Roblox's current OAuth 2.0 docs](https://create.roblox.com/docs/cloud/auth/oauth2-overview)
before going live.

### Wiring up the Google Form

The tips form does **not** post to Google directly from the browser — it
posts to our own `/api/tips` route, which validates, rate-limits, and
anti-bot-checks the submission, then forwards it server-side to Google
Forms. This means:

1. Real HTTP success/failure feedback (a direct client → Google no-cors
   POST can't tell you if it worked).
2. The form's real URL/field IDs never appear in client-side JS.

To wire it up: open your Google Form, get its pre-filled link (⋮ menu →
"Get pre-filled link"), fill in dummy values per field, and copy it. The
URL's `entry.XXXXXXXXX` query params are the entry IDs — put those in
`GOOGLE_FORM_ENTRY_*`. Replace `/viewform` with `/formResponse` in the
form's base URL for `GOOGLE_FORM_ACTION_URL`.

Until these are set, the form shows a clean "temporarily unavailable"
error instead of silently dropping submissions.

## Architecture: how the permission system extends

This was built so the future case-management dashboard (and any other
staff-only page) can be added **without touching auth, OAuth, or the
permission core** — only additive config changes:

```
Roblox group + rank/role name
        │
        ▼
src/config/role-mappings.ts   (which Roblox roles map to which tiers)
        │
        ▼
src/lib/permissions/tiers.ts  (tier → capabilities: dashboard:view, cases:view, ...)
        │
        ▼
src/config/route-permissions.ts  (route prefix → required capability)
        │
        ▼
src/middleware.ts  (redirects unauthenticated/unauthorized requests)
        +
every protected layout/page re-checks the same capability server-side
(defense in depth — see below)
```

**To add a new role or tier** (e.g. a "Coroner" tier): add a `PermissionTier`
id and its `TierDefinition` (capabilities) in `tiers.ts`, add a matching
rule in `role-mappings.ts`, and — if it needs a new protected page — add a
row to `route-permissions.ts`. Nothing in `auth.ts`, `middleware.ts`, or
any existing page changes.

**To add a new protected page**, add a `RouteRule` in
`route-permissions.ts` and, in the page/layout itself, redirect via
`hasCapability(session.user.tiers, CAPABILITIES.YOUR_NEW_CAPABILITY)`. See
`src/app/dashboard/cases/page.tsx` for the pattern.

### Why every protected page re-checks auth, not just middleware

`middleware.ts` gates `/dashboard/*` at the edge, but `src/app/dashboard/layout.tsx`
and each nested page call `auth()` and check capabilities again
server-side. This isn't redundant: middleware bypass bugs have happened
before in Next.js (e.g. CVE-2025-29927), and a future route added outside
the middleware's matcher would otherwise be silently unprotected. The
capability check itself lives in one place
(`src/lib/permissions/resolve.ts`) and is unit-tested
(`src/lib/permissions/resolve.test.ts`), so re-checking it everywhere is
cheap and safe.

### Session strategy

Auth.js is configured with **JWT sessions**, split across two files:

- `src/lib/auth.config.ts` — providers, callbacks, no Prisma import. Used
  by `middleware.ts` so the (Node-only) Prisma client never gets bundled
  into the Edge runtime.
- `src/lib/auth.ts` — the same config plus a Prisma upsert of a local
  `User` row on sign-in, for use in server components/route handlers
  (Node runtime). This is what gives `Case.assignedAttorneyId` something
  to point at once case creation is built.

Roblox group roles are re-checked from Roblox's public Groups API at
most once an hour per session (see `ROLE_REFRESH_INTERVAL_MS` in
`auth.config.ts`), so a promotion/demotion in Roblox takes effect without
forcing a full re-login, but without hitting Roblox's API on every request
either.

## Security notes

- **CSP with per-request nonces** (`src/middleware.ts`): `script-src` has
  no `'unsafe-inline'` — Next.js's own hydration scripts are allowed via a
  nonce it detects automatically from the CSP header. `style-src` does
  allow `'unsafe-inline'`, which is unfortunately required for React's
  `style={{...}}` attribute (CSS has no nonce mechanism for inline style
  *attributes*, only for `<style>`/`<link>` elements).
- **Tip form**: server-side Zod validation, a hidden honeypot field, a
  minimum-fill-time check, per-IP rate limiting (in-memory — replace with
  a shared store like Upstash Redis if this ever runs on more than one
  instance), and an `Origin` header check on the API route.
- **`src/lib/env.ts`** validates all environment variables at boot with
  Zod, so a missing/malformed secret fails immediately with a clear
  message instead of surfacing deep inside an OAuth callback.
- CaseStatus is a validated `string` column, not a Prisma `enum` — SQLite
  doesn't support enum columns. `src/lib/case-status.ts` is the single
  source of truth for valid values.

## Tests

```bash
npm run test        # unit tests (permission resolution, route rules, validation)
npm run typecheck
npm run build
```

Unit tests cover the permission/capability resolution logic and route
protection config — the parts of this app where a silent bug means a data
leak, not just a broken UI.

## What's scaffolded vs. what's next

**Built:** public home page (announcements, office info, tip line), staff
login via Roblox OAuth2, the full permission-tier system, and a staff
dashboard with a real (Prisma-backed) case list and case detail view.

**Scaffolded, not built out:** case *creation/editing* UI (the `Case`
model and `cases:create`/`cases:edit`/`cases:delete` capabilities exist;
only the read-only views are wired up), a staff directory page for the
Law Enforcement/Government tiers (they currently only get
`staff_directory:view` as a capability with no page behind it yet), and
an admin UI for managing announcements (currently seeded directly via
`prisma/seed.ts`).

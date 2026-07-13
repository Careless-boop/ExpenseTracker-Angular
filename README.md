# ExpenseTracker — Angular frontend

Angular 22 SPA for the [ExpenseTracker .NET API](../ExpenseTracker-.NET). Standalone
components, signals, zoneless change detection, lazy-loaded routes.

The UI is a port of the Claude Design project *"ExpenseTracker — Design Mockups"* — a
glossy 90s/00s web style: blue chrome bars with a hard gradient midline, plastic pill
buttons (blue = primary, green = create/settle, red = destructive, gold = irreversible),
a pinstriped desktop, beveled panels, Trebuchet MS headings over Tahoma body text.
Both the light and dark mockup themes ship; the toggle lives in the header.

## Running it

The API must be running first (it listens on `http://localhost:5178` under the `http`
launch profile):

```bash
cd ../ExpenseTracker-.NET
dotnet run --project src/ExpenseTracker.API --launch-profile http
```

Then:

```bash
npm install
npm start          # http://localhost:4200
```

`ng serve` proxies `/api` to the API (see `proxy.conf.json`), so the app is same-origin in
development and no CORS round-trip is involved. For a different API host, change the target
there; for production, either serve the SPA behind the same origin as the API or point
`src/app/core/api.config.ts` at an absolute URL.

## Layout

```
src/app/
  core/          models, API services, auth + token rotation, interceptor, guards,
                 formatting, and the split calculator
  shared/        the UI kit: dialogs, avatars, category icons, pager, empty states,
                 toasts, and the category manager reused by both category screens
  layout/        the app shell (chrome header + nav)
  features/      auth · dashboard · personal (transactions, categories) ·
                 lists (index, detail shell, 5 tabs, split editor, settlement + close
                 dialogs) · settings
```

## Things worth knowing

**Refresh tokens rotate and are single-use.** `AuthService` shares one in-flight refresh, so
parallel 401s can't both spend the token and log the user out. A failed refresh is terminal
and returns to `/login`.

**The split editor mirrors the server's arithmetic exactly** (`core/split.ts`). It has to:
the API rejects a split that doesn't reconcile, so a naive form produces constant 400s. Both
sides order participants by member id, land the rounding remainder (the odd cent of e.g.
10.01 ÷ 3) on the first one, and work in integer cents. The editor previews the real
per-person shares and keeps submit disabled until the split balances.

**Roles gate the UI, they don't just grey it out.** Actions a role can't perform are hidden
(`ListContext.canEdit` / `canManage`). A closed list is frozen — every write endpoint returns
400 — so `canEdit` is false for everyone while `closedAt` is set.

**Settlements can only be recorded for yourself or a placeholder.** You cannot fabricate a
payment in another real user's name (the API answers 403), so the payer picker offers exactly
you + mock members, and the Settle action on a debt row is hidden when the debtor is someone
else with an account.

**A 404 on a list means "missing, or you're not a member"** — deliberately indistinguishable,
so the copy never implies "no permission".

## Not built, on purpose

The API has no endpoints for these, so the screens would be dead ends: password reset, email
verification, profile/password editing, invite-by-email, sortable columns, text search,
spending trends over time, cross-list balances, currency selection, notifications, avatar
uploads, receipts. Money is a bare decimal with no currency in the data model, so one display
currency (USD) is applied globally.

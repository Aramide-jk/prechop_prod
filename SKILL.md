---
name: full-stack-validation
description: >-
  End-to-end validation and production-readiness pass for a full-stack
  project: seed databases with realistic data, start every service and
  frontend, drive the UI route-by-route with Playwright to verify each
  page integrates with its backing services, raise unit-test coverage
  above a real threshold, audit for security and design flaws, and fix
  what's broken. Use whenever the user asks to "test the whole app / all
  services / all routes", "make it production ready", "validate everything
  end to end", "check coverage across services", "seed the DB and test the
  frontend", "do a full QA pass", "make sure it's ready to deploy", or
  "check for leaked secrets/credentials" — even if they don't name
  Playwright or a specific service. Prefer this over ad-hoc testing
  whenever the scope is "the entire application" rather than a single
  file or function.
---

# Full-stack validation & production-readiness

This skill runs a disciplined, whole-application validation pass: real
seed data, all services running, every UI route exercised with a real
browser, high unit-test coverage, a security review, and fixes for what
you find. The goal is a defensible statement — backed by evidence — that
the application is ready to deploy.

It is deliberately project-agnostic. Discover the stack first, then apply
the phases. Never assume a framework, database, or command; read the repo.

## Operating principles

- **Evidence over assertion.** Never say a route "works", a service is
  "tested", or coverage "passes" without command output or a browser
  observation that proves it. If you didn't run it and see it, it isn't
  done. This mirrors the verification discipline the user expects.
- **Integration is the bar, not rendering.** A page is not "done" because
  it loads. It is done when its reads return seeded data, its writes
  persist to the backing store, its error and empty states behave, and it
  talks to every service it depends on. Track each route against that bar.
- **Fix forward, but stay in scope.** You are authorized to change code to
  make things correct and production-ready. Prefer the smallest correct
  fix. Flag anything that expands scope or changes product behavior before
  doing it.
- **Safety first.** You will be seeding databases and running services.
  Only ever touch local/dev/test databases and dev servers. Never point
  seeding or destructive test steps at anything that looks like production
  (prod connection strings, remote hosts, live credentials). If the target
  is ambiguous, stop and ask. Follow the user's global safety rules for
  destructive commands.
- **Report honestly.** If coverage falls short, a route is broken, or a
  service won't start, say so plainly with the output. A truthful "3 of 9
  routes fail" is worth more than a confident "all done".
- **Never copy a secret value into anything you write.** Reports, plans,
  audit docs, e2e specs, seeds, fixtures, commit messages, and logs you
  produce can end up committed and pushed. Reference a credential by its
  **location and fingerprint**: variable name, `file:line`, and — only
  for non-secret identifiers such as access-key IDs, usernames, and
  hosts — first/last 4 characters (`S3_ACCESS_KEY` in `.env.production`,
  key `AKIA…C3GE`). For the secret material itself (passwords, secret
  keys, tokens), print zero characters; the variable name and location
  already identify it. This holds precisely when you are documenting the
  secret as a finding: a security review that pastes the live value into
  a committed file IS the leak it is reporting.

## Phase 0 — Discover the project

Before doing anything, build a map. Don't guess; read.

1. Enumerate the services, apps, and frontends (monorepo packages, `apps/`,
   `services/`, separate repos). Note each one's language, framework, and
   role.
2. For each, find how it is **run** (`package.json` scripts, `Makefile`,
   `docker-compose.yml`, `Procfile`, `README`), how it is **configured**
   (`.env.example`, config files, required env vars), what **database(s)**
   it uses, and how its **tests** run (test runner, coverage tool).
3. Find the seed mechanism if one exists (`seed`, `seeds/`, `fixtures/`,
   `factories/`, migration seeders). If none exists, you will create one.
4. Map the **routes/pages** of each frontend and the API endpoints they
   call, so you know what "fully integrated" means per route.
5. Confirm required services (DB, cache, queue) are available locally, and
   the browsers Playwright needs are installed (`npx playwright install`
   if not).

Write this map down (a short `validation-plan.md` in the repo or scratch
space) and use it as the checklist for the rest of the run. Use a todo
list so nothing is silently skipped.

## Phase 1 — Seed realistic data

Goal: the frontend has visible, representative data to test against, and
every meaningful state is reachable.

- Use the project's own seed/migration/factory tooling when it exists;
  extend it rather than bypassing it, so seeds stay reproducible.
- Seed enough breadth to exercise real states: populated lists **and**
  empty states, pagination, multiple user roles/permissions, valid and
  invalid records, relationships across services, and any status/enum the
  UI branches on.
- Make seeds idempotent and re-runnable (safe teardown + reseed). Point
  them only at the local/dev/test database.
- Verify the seed landed by querying the store directly — don't assume the
  script's exit code means the rows exist.

## Phase 2 — Start all services and frontends

- Bring up dependencies first (DB, cache, queue), then backend services,
  then frontends. Prefer the project's orchestration (`docker-compose`,
  `turbo`, `npm-run-all`, Procfile) over launching things by hand.
- Run long-lived servers in the background; capture their logs to files so
  you can diagnose failures. Wait for each to report healthy (health
  endpoint, "listening on" log, port open) before depending on it.
- Confirm connectivity end to end: frontend can reach each API, each API
  can reach its DB. A frontend that renders but whose API calls 500 is not
  "up".
- Track every process/port you start. Tear them all down when finished —
  never leave orphaned servers holding ports.

## Phase 3 — Drive the UI route-by-route with Playwright

Use the Playwright that is installed. Work through the route map from
Phase 0 one route at a time. For each route, treat it as **not complete**
until it demonstrably integrates with everything it depends on.

For each route, verify as applicable:

- **Renders with real data** — the seeded data appears; no permanent
  spinners, no unhandled error boundaries, no empty grids that should be
  full.
- **Reads integrate** — data shown matches what's in the store; filters,
  search, sorting, and pagination actually query the backend and change
  results.
- **Writes integrate** — create/update/delete flows submit, succeed, and
  **persist** (re-query the DB or reload to confirm), and the UI reflects
  the change.
- **Navigation & guards** — links, redirects, auth-protected routes, and
  role-based visibility behave correctly for the relevant roles.
- **States** — loading, empty, error, and validation states render
  correctly (force them via seeded/edge data, not just the happy path).
- **Cross-service integration** — if a page composes data from multiple
  services, confirm each contributes correctly and a failure in one
  degrades gracefully.
- **No console/network smoke** — watch for console errors and failed
  network requests; a 200 page with 401/500 XHRs is a failing route.

Capture evidence per route (screenshots, key assertions, the network
result). Save reusable Playwright specs into the project's e2e suite where
it has one, so this becomes repeatable rather than throwaway. Maintain a
route status table (route → integrated? → evidence → issues found) and
only mark a route done when it fully meets the bar above.

When a route fails, fix the cause (Phase 5) and re-run that route before
moving on.

## Phase 4 — Unit tests & real coverage

For **each** service/app independently:

1. **Sync tests with the codebase.** Find code that has drifted from its
   tests: new/changed modules with no or stale tests, removed code with
   dead tests, changed signatures. Update and add tests so the suite
   reflects what the code actually does now.
2. **Reach the coverage bar.** Get statement/branch coverage above the
   target (default **95%**; honor a different number if the user or repo
   config states one) using the project's coverage tool. Report the real
   number per service.
3. **Make it real testing, not coverage theater.** Tests must assert
   behavior and outcomes — correct return values, state changes, error
   paths, edge cases, boundaries. Reject tests that merely execute lines
   to inflate the metric (calling a function and asserting nothing, mocking
   away the very logic under test, snapshotting without meaning). If a
   branch is genuinely unreachable, exclude it explicitly with a reason
   rather than faking a test for it.
4. Run the full suite green and record the pass count and coverage summary
   as evidence.

If hitting 95% honestly requires refactoring untestable code (hidden side
effects, hard-wired dependencies), do the refactor — that's part of making
it production-ready — but keep behavior identical and note the change.

## Phase 5 — Security & design-flaw review

Read across the whole application for logic and design flaws, not just
lint-level issues. Look for, at minimum:

- **AuthN/AuthZ** — missing/incorrect access checks, broken object-level
  authorization (IDOR), privilege escalation, trusting client-supplied
  identity or role.
- **Input handling** — injection (SQL/NoSQL/command/template), unvalidated
  input, unsafe deserialization, SSRF, path traversal, unrestricted file
  upload.
- **Secrets & config** — hardcoded credentials/keys, secrets in the repo or
  logs, permissive CORS, debug/verbose errors leaking internals, insecure
  defaults.
- **Data & sessions** — sensitive data exposure, weak/missing rate limiting
  on auth and costly endpoints, insecure session/JWT handling, missing
  server-side validation behind client-side checks.
- **Business-logic flaws** — race conditions, state that can be driven into
  invalid combinations, workflow steps that can be skipped or replayed,
  money/quantity handling that can go negative or overflow.

### Secret-leak scan (mandatory)

A leaked credential outranks every other finding. Every pass:

1. Scan the working tree **and the full git history of every branch**
   (`git grep -E '<pattern>' $(git rev-list --all)`) for secret shapes:
   cloud access keys (`AKIA[0-9A-Z]{16}`), connection strings with
   embedded passwords (`://user:password@`), `BEGIN … PRIVATE KEY`
   blocks, API/bearer tokens, webhook URLs with embedded auth.
2. Confirm every `.env*` file except `.env.example` is gitignored and has
   **never** been committed (`git log --all -- .env .env.production`),
   and that `.env.example` holds placeholders only.
3. Scan non-code artifacts — docs, prior audit reports, fixtures, seed
   data, test snapshots, Playwright traces/screenshots, CI configs. After
   the code is clean, these are where secrets hide.
4. If a secret is or **ever was** in the git history of a repo with a
   remote, treat it as a live incident, not a finding to file: the value
   is compromised no matter what is deleted later, and removing the file
   at the tip does not remove it from history. Stop and tell the user
   immediately; recommend rotating the credential; offer to purge history
   (`git filter-repo` / `filter-branch` + force-push) and to take a
   public repo private while that happens.

For each finding, record severity, the concrete exploit/failure scenario,
and the fix — identifying any credential by location + fingerprint only,
per the operating principle above. Fix the clear ones; surface anything
risky or ambiguous to the user before changing behavior.

## Phase 6 — Fix, re-verify, and finish

- Apply fixes for issues found in any phase, smallest-correct-fix first.
- After each fix, **re-run the affected check** (route, test, coverage,
  security item) and confirm the fix with output — don't assume.
- Loop until every route meets the integration bar, every service is green
  and above the coverage threshold, and security findings are resolved or
  explicitly accepted by the user.
- Add anything else genuinely needed for a complete job that the project
  is missing and is in scope: health checks, CI wiring for the new tests,
  a repeatable seed script, a smoke-test entry point, `.env.example`
  updates, or docs for running the validation.
- **Clean up:** stop every service/process you started; leave the repo in
  a clean, runnable state.

## Final report

End with a clear, evidence-backed summary the user can act on:

- **Per service:** tests pass/total, real coverage %, notable gaps.
- **Per route:** integrated (yes/no), evidence, any issues and their status.
- **Security:** findings by severity, fixed vs. open. Include the
  secret-leak scan verdict (working tree + git history: clean, or
  leaked → rotated/purged), with credentials named by fingerprint only.
- **Changes made:** what you modified and why.
- **Deploy verdict:** ready / not ready, with the specific blockers if not.

Don't claim "production ready" unless the evidence supports it. If parts
remain unverified or failing, state exactly which, so the user knows what's
left rather than being told a comforting untruth.

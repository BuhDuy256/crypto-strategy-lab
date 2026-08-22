# Coding Standards

What this repository already does, written down so every session writes code the
same way. The `code-review` skill reads this file as the Standards axis.

This file records **conventions**. It never creates architecture rules. Boundaries,
ownership, dependency directions, and delivery semantics come from
`docs/architecture/architecture-baseline.md` and the accepted ADRs, and a conflict is
resolved in their favour through the deviation procedure in `AGENTS.md`.

Prefer the check a tool already performs. Where a rule below is enforced by
`pnpm run typecheck`, `pnpm run lint`, or `pnpm run test`, review does not need to
repeat it by hand.

## Layout

```text
apps/backend/src/
  modules/<module>/        one of the five frozen modules; index.ts is its only surface
  platform/                cross-cutting runtime services (config, database, logger)
  architecture/            the boundary rule engine and its test
  migrate/                 migration runner entry commands
apps/backend/migrations/   *.sql, applied in filename order
apps/web/src/
  pages/ components/ api/  SPA routes, shared components, the single typed API client
packages/api-contracts/    request/response shapes shared by backend and web
```

A module directory exports exactly one `index.ts`. Everything else inside it is
private. Cross-module imports go through that `index.ts` and only along an allowed
edge. `apps/backend/src/architecture/boundary.test.ts` enforces this; do not
hand-check it.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files and directories | kebab-case | `request-id.middleware.ts`, `test-database.ts` |
| Test files | same name plus `.test` | `config.test.ts`, `App.test.tsx` |
| Types, interfaces, classes, React components | PascalCase | `AppConfig`, `HealthController`, `HealthStatus` |
| Functions, variables, object fields | camelCase | `buildLogRecord`, `processRole` |
| Rule and identifier literals | SCREAMING-KEBAB | `"BOUND-1-INDEX-ONLY"` |
| Environment variables | SCREAMING_SNAKE | `POSTGRES_HOST` |
| Database schemas | the owning module's name | `market`, `strategy`, `experiment`, `news` |
| Migration files | `NNNN_snake_case.sql`, zero-padded to four digits | `0001_create_module_schemas.sql` |
| Workspace packages | `@crypto-strategy-lab/<name>` | `@crypto-strategy-lab/api-contracts` |

Name a thing for what it is, not for the pattern it uses. `HealthController`, not
`HealthControllerImpl`.

## TypeScript

- `strict` is on repository-wide, with `noUncheckedIndexedAccess`. Do not weaken it
  in a package `tsconfig.json`.
- No `any`. Use `unknown` at a boundary and narrow it with a type guard, the way
  `isHealthResponse` does in `packages/api-contracts`.
- No non-null assertion to silence a strict-mode error. Handle the missing case.
- Prefer `interface` for object shapes others implement or consume; use `type` for
  unions, aliases, and function types.
- Mark data fields `readonly` unless something has to mutate them.
- ESM only. Relative imports carry the `.js` extension, because the build is
  `NodeNext`: `import { getRequestId } from "./request-context.js";`.
- Use `import type` for type-only imports.
- Export what the module surface needs and nothing more.

## Comments

Each non-trivial file opens with a short comment saying what it is for and, when the
shape is not obvious, why it is built that way. Keep it to a few lines. Do not
narrate code that already reads clearly.

## Error handling

- Fail fast at startup. A missing or malformed configuration value throws
  immediately and names the exact variable, as `platform/config.ts` does. Never let
  an undefined value reach the rest of the app.
- Throw `Error` with a message that says what was wrong and what to do about it.
  Include the offending value when it is safe to show; never include a secret.
- Do not swallow an error to keep going. If a failure is genuinely tolerable, say so
  in a comment and log it.
- Entry commands (`main.api.ts`, `run-migrations.ts`, `reset-database.ts`) catch at
  the top level, report, and exit non-zero. Library and domain code throws and lets
  the caller decide.
- One frozen rule has teeth here: news or sentiment failure must not stop market
  charts or backtesting. Isolate it at the port, not with a bare catch.

## Logging

- Application code logs through the structured logger in `platform/logger.ts`, so
  every line carries timestamp, level, process role, and request id.
- Direct `console` use is acceptable in exactly two places: inside the logger's own
  transport, and in a CLI entry command whose whole output is meant for a human
  terminal (`run-migrations.ts`, `reset-database.ts`, the bootstrap failure in
  `main.api.ts`). Anywhere else, use the logger.
- Never log a secret, a full credential, or a whole request body.
- One record per line. Development pretty-prints; `NODE_ENV=production` emits raw
  JSON.

## HTTP, DTOs, and validation

- Transport validation happens at the transport edge: `class-validator` DTOs in
  `modules/api`, checked by the global `ValidationPipe`. Domain code receives values
  that are already valid and does not re-validate shapes.
- A DTO is a transport type. Do not pass a DTO into domain logic; map it to a domain
  type first.
- Controllers stay thin: validate, delegate, return. No strategy, backtest,
  evaluation, or ranking logic in a controller.
- Every response shape the SPA consumes lives in `packages/api-contracts`, with a
  runtime type guard when the frontend parses it. That package stays free of NestJS,
  React, and every other framework dependency.
- The backend declares the same shape next to its controller and keeps it in sync
  with the contract package; a comment names the counterpart file.
- The SPA talks to the backend only through `apps/web/src/api/client.ts`. No `fetch`
  inside a component or page.

## Database

- One PostgreSQL schema per data-owning module: `market`, `strategy`, `experiment`,
  `news`. Only the owning module reads or writes its schema. Cross-module data is
  requested through the other module's port, never by querying its tables.
- Schema changes ship as plain SQL migrations in `apps/backend/migrations/`, applied
  in filename order and tracked in `public._migrations`.
- Migrations are forward-only and safe to re-run: `pnpm run migrate` twice in a row
  is a no-op. Never edit a migration that has already been applied anywhere; add a
  new one.
- Database access uses the `pg` client through `platform/database.ts`, which reads
  connection values only from `platform/config.ts`. No connection literals elsewhere.
- Keep SQL out of domain code. A repository or adapter owns the query; the domain
  owns the decision.

## Tests

- Vitest. Test files sit beside the code they test and end in `.test.ts` or
  `.test.tsx`.
- Test the public surface, not private internals. Prefer a pure function extracted
  for testability (`buildLogRecord`) over reaching inside a class.
- One behaviour per test; the test name states the behaviour, not the method name.
- Database-backed tests use `platform/test-database.ts` so each run gets clean,
  isolated schema state. No manual setup steps and no shared mutable fixture.
- Write the failing test first (`tdd` skill). A test that never failed proves
  nothing.
- Do not delete or weaken a test to make a change pass.

## Formatting

There is no formatter in the repository. Match the surrounding file:

- two-space indentation;
- double quotes in TypeScript;
- semicolons;
- no trailing comma in a multi-line literal;
- roughly 100 columns.

If a formatter is ever added, that becomes the rule and this section shrinks to name
it.

## Commits

- Conventional Commits: `type(scope): summary`, for example
  `feat(setup): complete V1 platform foundation (SETUP-01 through SETUP-06)`.
- Scope is the slice family or area: `setup`, `market`, `strategy`, `experiment`,
  `news`, `ui`, `docs`, `governance`.
- Commit at slice boundaries, so each commit is one reviewable diff.
- Committing and pushing require a separate explicit user request. An agent never
  commits on its own initiative, never creates a version tag, and never pushes.

## Before calling a slice done

```powershell
pnpm run typecheck
pnpm run lint
pnpm run test
```

Plus the slice's own validation commands from its plan file, and
`scripts/check-repo-governance.ps1` when governance, architecture documents, ADRs, or
project skills changed.

# Module boundaries are enforced by a test, not by convention

## What is being demonstrated

"Modular monolith" is a claim anyone can make about any codebase. This repository turns
it into something a machine checks: six boundary rules run as a normal test over the
real source tree, and the build fails if any module edge is violated.

That test is the answer to two questions a reviewer usually has to take on trust:

- *Is there a God Service that knows about everything?*
- *Does the frontend contain business logic?*

## Why it matters architecturally

Boundaries erode silently. One import added under deadline pressure does not break any
feature, so nothing catches it, and six months later the modules are notional. A rule
that only exists in a document is a rule that only gets checked when someone remembers
to check it.

Encoding the frozen baseline's dependency directions as an executable test moves
boundary enforcement from review discipline to build failure.

## Current implementation

| Part | File |
|---|---|
| Pure rule engine, no filesystem access | `apps/backend/src/architecture/boundary-rules.ts` |
| Real source-tree scanner | `apps/backend/src/architecture/scan-source-tree.ts` |
| Test, real tree plus one synthetic fixture per rule | `apps/backend/src/architecture/boundary.test.ts` |

The rule engine is deliberately pure: it takes an already-scanned list of files and
their resolved import edges. That is why each rule can be proven to actually fire, using
a small synthetic fixture, separately from the whole-repository scan.

The scan covers `apps/backend/src` (180 source files, 5 modules) and `apps/web/src`
(18 source files).

## The six rules

| Rule | What it forbids | Which anti-pattern it blocks |
|---|---|---|
| `BOUND-1-INDEX-ONLY` | Importing another module's internals instead of its `index.ts` | Modules with no real public surface |
| `BOUND-2-ALLOWED-EDGE` | Any module-to-module edge not on the allowed list | Arbitrary coupling; a module that reaches everywhere |
| `BOUND-3-DOMAIN-PURITY` | `domain/` importing NestJS, HTTP clients, database, queue, or provider SDKs | Domain logic welded to a framework or an exchange payload |
| `BOUND-4-PLATFORM-NO-MODULES` | `platform/` importing from `modules/` | Shared infrastructure depending upward on business modules |
| `BOUND-5-NO-INTERNAL-REACH` | Any outside file importing a module's `infrastructure/` or `domain/` path directly | Bypassing the module's port to reach its repository or ORM model |
| `BOUND-6-WEB-CONTRACTS-ONLY` | `apps/web` importing `apps/backend`, or importing messaging contracts | **Strategy, backtest, or ranking logic in the frontend** |

The allowed cross-module edges are declared in one place, `ALLOWED_MODULE_EDGES`:

```ts
export const ALLOWED_MODULE_EDGES: Readonly<Record<string, readonly string[]>> = {
  api: ["market", "strategy", "experiment", "news"],
  experiment: ["strategy", "market", "news"]
};
```

Every edge not listed is a violation. `market`, `strategy`, and `news` have no outgoing
module edges at all: they do not know the other modules exist. API may reach every
module because composing queries and transport is its job. Experiment may reach
Strategy, Market, and News because running an experiment needs all three.

There is no entry that lets any module reach `api`, so no module can call back into
transport.

## Evidence

### Rule to check to command to result

```powershell
npx vitest run apps/backend/src/architecture
```

Recorded at commit `ff4eef7` on 2026-09-04:

```text
 ✓ apps/backend/src/architecture/boundary.test.ts (7 tests) 535ms
   ✓ architecture boundary rules (real source tree)
     > has no boundary violations under apps/backend/src or apps/web/src  526ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Seven tests: one that scans the real tree and finds zero violations, plus one per rule
proving that the rule actually fires when it should. Both halves matter. A rule engine
that reports "no violations" because it never detects anything is worthless, so each
rule is also shown failing against a deliberately bad fixture.

This test runs as part of `pnpm run test`. It is not a separate optional audit.

### Data ownership matches the module boundaries

Each data-owning module gets exactly one PostgreSQL schema, created in
`apps/backend/migrations/0001_create_module_schemas.sql`:

| Schema | Owning module |
|---|---|
| `market` | Market Data (`ARC-MARKET`) |
| `strategy` | Strategy (`ARC-STRATEGY`) |
| `experiment` | Experiment (`ARC-EXPERIMENT`) |
| `news` | News Intelligence (`ARC-NEWS`) |

Only the owning module writes to its schema. `BOUND-5-NO-INTERNAL-REACH` is what stops
another module from reaching a repository class to get around that.

### Supporting sources

- [`docs/architecture/architecture-baseline.md`](../architecture/architecture-baseline.md) — "Allowed dependency directions", "NestJS realization invariants"
- [`ADR-001`](../adr/ADR-001-modular-monolith-process-roles.md) — the modular-monolith decision and its evidence obligation
- [`docs/diagrams/05-module-boundaries.md`](../diagrams/05-module-boundaries.md) — the same boundaries as a diagram, with a forbidden-examples table

## What is safely claimable

- The five logical modules have machine-checked boundaries, not documented intentions.
- The frontend provably contains no import of backend code. `BOUND-6` fails the build
  otherwise.
- Domain code provably imports no framework, database, queue, or exchange SDK.
- Cross-module access goes through module `index.ts` surfaces only.
- Each rule is proven capable of firing, so a green result is meaningful.

## What is NOT claimed

- **This is a static import check.** It proves dependency direction and module surface.
  It does not prove a module's logic is correct, well-factored, or free of duplication.
- **It does not detect logic in the frontend that was written from scratch there.**
  `BOUND-6` proves the web app does not import backend code; it cannot prove nobody
  reimplemented a calculation by hand. That property is argued from the code, not
  machine-checked.
- No runtime coupling, no call-graph analysis, and no performance property is measured
  here.

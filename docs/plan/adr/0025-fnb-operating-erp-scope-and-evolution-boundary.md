# ADR 0025 — F&B Operations System scope and evolution boundary

**Status:** Accepted (2026-08-09)

**Decision owner:** Owner

**Amended by:** ADR 0038 (native Android clients in repository `app`; this
ADR still forbids splitting `apps/web` and local-first POS). Naming amendment
2026-08-24 (Owner): the `F&B Operating ERP` label is retired; the product name
is **F&B Operations System** (`Hệ thống Vận hành F&B`). Scope below is
unchanged.

Runtime topology and package graph: [`docs/spec/architecture.md`](../../spec/architecture.md).
This ADR owns product scope and evolution boundary; do not implement layout
from a vendor catalog.

## Decision

### 1. Product definition

The product is the **F&B Operations System** (`Hệ thống Vận hành F&B`): it
runs the restaurant day, not the statutory books. The accepted outcome chain
is:

sell correctly → kitchen receives correctly → collect correctly →
print/`HĐĐT` correctly → stock deducts correctly → management sees real
operations.

Finance stays operational per D020 (`finance_basic`): no general ledger, no
Circular 200 / VAS close UI inside the current Finance boundary.

### 2. Evolve in place; the catalog is a vision map

Monorepo topology is unchanged and owned by `docs/spec/architecture.md`.
New domain capability lands as `apps/web/lib/<domain>` plus a Postgres RPC
when correctness spans rows. A new package is justified only by a second
runtime, a trust boundary, or an independently built artifact.

External module catalogs are a **vision map** for deciding what capability
should exist. They are not a monorepo layout and not a backlog.

### 3. Build priority

Sequencing is a durable constraint, not a schedule:

1. Harden Commerce: POS, KDS, pickup, payment, print.
2. Inventory plus recipe/costing integrity.
3. Production and waste with reasons.
4. Operational finance period result.
5. Thicken Control Ops.
6. HR labor-cost linkage.
7. CRM / loyalty.
8. BI / AI, subject to the autonomy cap in `docs/agent/rules/workflow.md`.

Two ordering invariants win on conflict: operational finance comes **before**
full CRM, and no ledger-shaped reporting ships **before** costing is reliable.

### 4. Non-goals

Rejected until this ADR is superseded:

- Splitting `apps/web` into `control-app` + `branch-app`, or into POS/KDS
  micro-apps.
- Creating `@comtammatu/{crm,hrm,finance,inventory}` without a second runtime
  consumer.
- General-ledger or accounting UI inside the current Finance boundary (D020).
- Treating the vision catalog as a sprint backlog.
- Local-first POS (D012). Native Android clients are ADR 0038 (separate
  repository `app`); they are not a reason to split `apps/web`.

## Consequences

- ERP-shaped feature requests are answered with capability placement under
  `apps/web/lib/<domain>` + RPC, not with a new app or package.
- Agents cite this ADR when refusing a package/app split, and cite owning
  docs (not this ADR) for plane, vocabulary, and placement detail.

## Verification

- `packages/` gains no domain package without a named second runtime consumer.
- `apps/` still contains exactly `web` and `print-agent`.
- Finance surfaces expose no GL/close UI; `docs/modules/finance.md` stays
  operational.

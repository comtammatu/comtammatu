# ADR 0025 — F&B Operating ERP scope and evolution boundary

**Status:** Accepted (2026-08-09)

**Decision owner:** Owner

**Review tier:** T3 — product scope, package topology, and build sequencing

**Supersedes informal wording** that treated external "Operating ERP" module
catalogs as a target monorepo layout or a delivery backlog.

**Amended by:** ADR 0038 (native Android clients in repository `app`; this
ADR still forbids splitting `apps/web` and local-first POS).

## Context

`restaurant_operations_system` is single-tenant and multi-branch for CTCP
Chén Sứ / Cơm Tấm Má Tư. Vendor and industry "Operating ERP" catalogs list
modules (CRM, HRM, Finance, Inventory, BI) as separate deployables. Reading
those catalogs as a layout invites two failures this repository has already
rejected elsewhere: splitting `apps/web` per audience, and creating empty
`packages/*` for domains that have exactly one runtime consumer. A third
failure is treating a vendor catalog as a sprint plan, which contradicts
`docs/agent/rules/references.md` (no snapshot backlogs).

The naming, chrome, and audience facts this direction depends on are already
promoted to their owners and are not restated here: UI planes and `/me/*`
audience in `docs/ref/screen-context-map.md` §2.4/§2.4B, station vocabulary
(`POS`, `KDS`, `pickup_display` → `Gọi số`) in `docs/ref/glossary.md`, package
and code-placement boundaries in `docs/spec/architecture.md`.

## Decision

### 1. Product definition

The product is an **F&B Operating ERP**: it runs the restaurant day, not the
statutory books. The accepted outcome chain is:

sell correctly → kitchen receives correctly → collect correctly →
print/`HĐĐT` correctly → stock deducts correctly → management sees real
operations.

Finance stays operational per D020 (`finance_basic`): no general ledger, no
Circular 200 / VAS close UI inside the current Finance boundary.

### 2. Evolve in place; the catalog is a vision map

Monorepo topology is unchanged: `apps/web` + `apps/print-agent`;
`packages/{shared,database,ui,security,print-render}`; `supabase/`.

New domain capability lands as `apps/web/lib/<domain>` plus a Postgres RPC
when correctness spans rows. A new package is justified only by a second
runtime, a trust boundary, or an independently built artifact — the existing
rule in `docs/spec/architecture.md`, restated here only as the test applied to
ERP-shaped requests.

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
8. BI / AI, subject to the autonomy cap in ADR 0020.

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
- Agents cite this ADR when refusing a package/app split, and cite the owning
  docs (not this ADR) for plane, vocabulary, and placement detail.
- Authority on conflict: `docs/spec/architecture.md` (topology and placement),
  `docs/ref/glossary.md` + `packages/shared/src/labels/**` (vocabulary),
  `docs/ref/screen-context-map.md` (audience/device),
  `docs/modules/finance.md` + D020 (finance boundary),
  `docs/ref/business-context.md` (business boundary), ADR 0020 (autonomy cap).

## Verification

- `packages/` gains no domain package without a named second runtime consumer.
- `apps/` still contains exactly `web` and `print-agent`.
- Finance surfaces expose no GL/close UI; `docs/modules/finance.md` stays
  operational.

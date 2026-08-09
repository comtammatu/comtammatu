# Architecture Landing

Shared entry point for system-level architecture documentation. `docs/ref/glossary.md`
describes current-source vocabulary. `docs/spec/architecture.md` is the sole source
for runtime architecture, package graph, and current code-placement rules. Deployment
status and day-to-day work live in runbooks or `tasks/todo.md`.

Source evolves through existing seams in `apps/*` and `packages/*`; do not fork
the repo or build a parallel product runtime.

## Read First

- [../spec/architecture.md](../spec/architecture.md) — **current** architecture + Product Dual Thesis (`Quản lý hệ thống` + `Vận hành bán hàng`)
- [../ref/glossary.md](../ref/glossary.md) — current-state vocabulary for the running system
- [../plan/decisions.md](../plan/decisions.md) — net-effect decisions, including D015/D091
- [../spec/database-schema.md](../spec/database-schema.md) — canonical schema and data boundaries
- [../modules/auth.md](../modules/auth.md) — current Auth/ACL + pointer to ADR 0015 cutover
- [../ref/business-context.md](../ref/business-context.md) — business boundary and product scope
- [../ref/inventory.md](../ref/inventory.md) — canonical semantics for procurement, production, stock, and transfer

## Purpose Of This Folder

- Route readers to the correct SSOT before writing docs, naming modules, or adding copy
- Reduce drift between business docs, specs, UI copy, and code comments

## Boundary

- `docs/spec/architecture.md`: current runtime/package/module contract
- `docs/architecture/*`: landing pointers only; not a second runtime contract
  archive
- `docs/ref/glossary.md`: source of truth for current-state vocabulary and naming
  policy
- `docs/ref/*`: business rules and domain semantics in detail
- `docs/spec/*`: schema, data flow, diagrams, implementation-facing structure
- `docs/modules/*`: module-level onboarding and blast-radius notes

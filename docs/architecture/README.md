# Architecture Landing

Common entry point for system-level architecture documentation.
`docs/ref/glossary.md` is the canonical vocabulary for the current system.

## Read First

- [../ref/glossary.md](../ref/glossary.md) — current-system vocabulary
- [../spec/architecture.md](../spec/architecture.md) — current system architecture overview
- [../spec/database-schema.md](../spec/database-schema.md) — canonical schema and data boundaries
- [../modules/auth.md](../modules/auth.md) — Auth, JWT claims, and current-system ACL
- [../ref/business-context.md](../ref/business-context.md) — business boundary and product scope
- [../ref/inventory.md](../ref/inventory.md) — canonical procurement, production, stock, and transfer semantics

## Purpose of This Directory

- Keep system-level architecture decisions in one discoverable place.
- Direct readers to the correct current-state vocabulary before writing docs,
  naming modules, or adding copy.
- Reduce drift between business docs, specs, UI copy, and code comments.

## Boundary

- `docs/architecture/*`: cross-cutting architecture, decision narrative, and
  entry points to the correct current-state vocabulary
- `docs/ref/glossary.md`: source of truth for current-system vocabulary and naming
  policy
- `docs/ref/*`: detailed domain business rules and semantics
- `docs/spec/*`: schema, data flow, diagrams, and implementation-facing structure
- `docs/modules/*`: module-level onboarding and blast-radius notes

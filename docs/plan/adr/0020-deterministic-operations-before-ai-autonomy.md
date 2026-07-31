# ADR 0020 — Deterministic operations before AI autonomy

**Status:** Accepted

## Context

Operational actions can affect money, tax, labor, inventory, or customer
records. Language-model confidence is not evidence that those actions are
correct, authorized, or reversible.

## Decision

1. Business facts, thresholds, routing, deduplication, and state transitions
   are computed by deterministic application and database code.
2. An LLM may summarize or explain computed facts. It does not calculate the
   authoritative number and does not receive unrestricted database or RPC
   access.
3. Money, tax, and labor automation is capped at informing an authorized
   operator. It never auto-acts.
4. Any bounded automatic action must be allowlisted, idempotent, reversible,
   permission-checked, and reviewed as T3.
5. Agent actions reuse an existing authorized RPC boundary. A new generic
   “agent action API” is not permitted.
6. Notifications use `docs/spec/toast-notification-system.md`; channels without
   an owned runtime and delivery contract do not belong in the roadmap.

## Consequences

- Product workflows remain usable without an LLM.
- Confidence scores cannot promote autonomy.
- A new automation proposal must identify its deterministic source, authority,
  rollback, deduplication, and verification before implementation.

## Authority

- `docs/agent/rules/workflow.md`
- `docs/agent/rules/database.md`
- `docs/spec/toast-notification-system.md`

# ADR 0031 — Shared inventory variance reason codes

**Status:** Accepted direction (Owner task 2026-08-10) — stocktake lands first;
transfer causal codes optional follow-up.

**Decision owner:** Owner

**Review tier:** T2 — inventory analytics vocabulary, stocktake/waste alignment

## Context

ADR 0028 closed transfer shortfall **ownership** with
`transfer_source_variance` / `transfer_transit_loss` on
`stock_movements.movement_subtype`. Stocktake variance still stored only
free-text `variance_reason`, so drift cannot be aggregated. Waste already has a
constrained English `stock_issue_items.reason_code` set.

INV-12 asked for one shared `reason_code` vocabulary across transfer shortfall,
stocktake variance, and waste.

## Decision

### 1. One causal catalog; ownership stays separate

- **Causal `reason_code`:** reuse the existing waste CHECK enum
  (`spoiled`, `expired`, `dropped`, …, `other`).
- **Ownership / ledger discriminator:** keep transfer
  `shortfall_class` → `movement_subtype`
  (`transfer_source_variance` / `transfer_transit_loss`). Do not put those
  ownership codes into the causal catalog.

### 2. Stocktake stores both code and optional note

- Add `stocktake_lines.reason_code` (nullable CHECK, same enum as waste).
- Keep `variance_reason` as the optional free-text note.
- Completing a stocktake with a non-zero adjustment requires `reason_code`.
- Movement `reason` text may include the code plus note for audit readability;
  aggregation reads the line `reason_code`.

### 3. Transfer causal code is deferred

Transfer receive already requires classification + note ≥5. Adding a causal
`reason_code` beside `shortfall_class` is allowed later without changing
ownership semantics. Waste UI and labels remain the label source
(`WASTE_REASON_LABELS_VI`).

### 4. Vietnamese labels stay in shared labels

English codes in schema; Vietnamese product labels in
`packages/shared/src/labels/vi.ts` only.

## Consequences

- Stocktake variance becomes trendable with the same codes as waste.
- Transfer ownership reporting stays on `movement_subtype`.
- Glossary keeps transfer ownership terms; waste/stocktake causal codes share
  the waste label table.

## Canonical

- ADR 0028, `docs/ref/inventory.md`, `docs/ref/glossary.md`,
  `packages/shared/src/labels/vi.ts`

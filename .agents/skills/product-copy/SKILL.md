---
name: product-copy
description: >-
  Research and review Vietnamese product UI copy (hints, descriptions, labels,
  toasts). Use when writing or rewriting UI wording, fixing bilingual mashups,
  opaque jargon, spelling/terminology drift, or owner complaints about hard-to-
  read Hint/Description text. Enforces glossary label_vi and lint:copy.
---

# Product Copy Researcher

Specialist for **Vietnamese product UI wording**. Engineering docs, identifiers,
commits, and agent prose stay English (`docs/agent/rules/language.md`).

## When to use

- Owner or QA flags Hint / Description / helper text as unclear or bilingual
- Adding or editing strings under `apps/web/lib/messages/**`, shared
  `messages`/`labels`, or inline product UI copy
- Reviewing finance / inventory / food-cost / consumption copy for ops clarity
- Before claiming copy work done — run the checklist below

Do **not** load this skill for routine non-copy code changes.

## Authority (read in order)

1. `docs/agent/rules/language.md` — Vietnamese UI vs English engineering
2. `docs/ref/glossary.md` — `canonical_term` → `label_vi` (never invent synonyms)
3. `docs/agent/rules/ui.md` § Copy And State — one concept, one name; no agent notes in UI
4. Shared dictionaries: `apps/web/lib/messages/**`, `packages/shared/src/messages/**`,
   `packages/shared/src/labels/**`

Glossary wins on conflicts. Update glossary first if renaming a term.

## Non-negotiable rules

| Do | Do not |
| --- | --- |
| Vietnamese only on product surfaces | Bilingual mashups (`Stock · Kho`, EN+VI in one label) |
| Short plain sentences an owner/ops person can read aloud | Packed middot jargon (`A · B · C` as a fake sentence) |
| Glossary `label_vi` (`giá vốn món`, `tiêu hao`, `giá vốn định mức`) | English engineering loanwords in UI (`bucket`, `hub`, `matching`, `snapshot`, `fallback`, `yield`, `inbox`) |
| Approved acronyms alone when needed (`POS`, `KDS`, `PO`, `GRN`, `WAC`, `HĐĐT`, `GTGT`, `COGS`) | Acronyms buried inside Vietnamese clauses without glossary support |
| Hint explains **what the number means** for the restaurant | Hint restates the KPI title or leaks schema (`allocation_bucket`) |

## Hint / Description review checklist

Before shipping Hint, Description, subtitle, or helper text:

1. **Audience** — Would a branch manager understand without reading code?
2. **One idea per sentence** — Prefer two short sentences over one clause stuffed with middots.
3. **Glossary** — Every domain noun maps to `label_vi`; quote English `canonical_term` only in agent notes, never in UI.
4. **No bilingual leftovers** — Scan for Latin jargon next to Vietnamese diacritics.
5. **No schema leak** — Ban `bucket`, table/RPC names, and English field names in UI.
6. **Consistency** — Same concept uses the same phrase across finance/inventory surfaces.
7. **Verify** — `corepack pnpm lint:copy` after edits; extend a nearby static test when fixing a known bad string.

## Common failure modes

| Failure | Why it happens | Fix |
| --- | --- | --- |
| Agent-translated engineering English | Prompted from schema/code comments (`food_cost bucket`) | Rewrite from glossary ops language |
| Middot density | Trying to compress three concepts into one line | Split into sentences or drop secondary detail |
| Incomplete VI migration | Old bilingual labels; `lint:copy` only bans known patterns | Prefer glossary + plain Vietnamese; add lint term if systematic |
| Identifier keys vs UI values | Message **keys** stay English; **values** must be Vietnamese | Never copy the key wording into the value |
| Over-precise accounting jargon | Correct for accountants, opaque for ops | Prefer “đã trừ kho theo đơn đã thanh toán” over “allocation trong cùng bucket” |

## Workflow

1. Locate strings in `apps/web/lib/messages/**` (preferred) or shared dictionaries — avoid scattering new literals in components.
2. Read glossary rows for every domain term in the sentence.
3. Draft short Vietnamese; read aloud once.
4. Diff against nearby sibling hints for tone consistency.
5. Run `corepack pnpm lint:copy`.
6. If fixing a regression the suite already guards, extend that static test with the new literal / banned phrase.

## Verification

```bash
corepack pnpm lint:copy
```

Optional when touching message contracts already covered by static tests:

```bash
corepack pnpm --filter @comtammatu/web exec node --test tests/finance-revenue-date-range.test.ts
```

## Output shape (when reporting)

- Before → after for each string changed
- Glossary terms used
- Remaining hotspots (path + short note) if out of scope
- Commands run and pass/fail

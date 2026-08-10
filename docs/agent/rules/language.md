# Bilingual Language Separation

Canonical language policy for this repository. Owner chat may stay Vietnamese;
everything below is file-language and identifier policy.

## English (required)

Write entirely in English:

- Agent entrypoints and rules: `AGENTS.md`, `CLAUDE.md`, `docs/agent/**`
- Tracked skill prose under `.agents/skills/**`
- Internal development docs: `docs/spec/**`, `docs/modules/**`, `docs/plan/**`,
  `docs/architecture/**`, `tasks/**`, `scripts/**` prose/comments
- Code identifiers: files, functions, variables, classes, types, RPC/schema
  names, env keys, config keys, API routes, infrastructure code
- Technical comments and commit subjects

Do not mix Vietnamese prose into those surfaces. Product brand names
(`Má Tư`, `Cơm Tấm Má Tư`, `Chén Sứ`) and glossary `label_vi` values may appear
as quoted labels or table cells when an English sentence must name the UI term.

## Vietnamese (required)

Write in Vietnamese:

- User-facing UI copy: labels, buttons, toasts, empty/error states, help text in
  product surfaces (`apps/web` messages/labels, shared dictionaries, print
  strings shown to operators/customers)
- End-user / owner business docs under `docs/ref/**` and operator runbooks that
  instruct humans in the restaurant (keep existing Vietnamese files Vietnamese)
- Comments that explain a Vietnam-specific legal or tax process only when the
  English comment cannot name the rule without the official Vietnamese phrase —
  prefer English plus a glossary citation

Vietnamese UI terminology must follow `docs/ref/glossary.md` (`canonical_term` →
`label_vi`). Never invent bilingual UI labels (`Stock · Kho`).

## Separation rules

| Layer | Language |
| --- | --- |
| Agent rules / skills / ADRs / specs / modules / tasks | English |
| Code, schema, RPC, paths, commits | English identifiers / English prose |
| Product UI and customer-facing copy | Vietnamese (or approved acronym alone) |
| Business/owner refs (`docs/ref/**`) | Vietnamese primary; keep `canonical_term` English |

## Enforcement

- UI copy drift: `corepack pnpm lint:copy` (`scripts/lint-copy.mjs`)
- English-required doc trees: `corepack pnpm lint:language-policy`
  (`scripts/check-language-policy.mjs`)
- Glossary wins on label conflicts; update the glossary before renaming UI terms

## Agent workflow

1. Read this file when changing copy language, glossary, or agent/docs language.
2. For UI strings, use shared messages/labels, load `.agents/skills/product-copy`,
   and run `lint:copy`.
3. For agent/technical docs, write English; quote `label_vi` only when needed.

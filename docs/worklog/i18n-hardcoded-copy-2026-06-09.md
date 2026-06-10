# i18n hardcoded copy cleanup — 2026-06-09

## T2 self-review

Skill plan: repo rules = engineering + skills + ui + workflow; external skills = shadcn for UI primitive/copy boundary; runtime tools = CLI ESLint summary; skipped = Browser smoke because this slice changes copy sources and lint gating only.

PM: scope = stop new inline Vietnamese JSX copy from growing and clean one low-risk Admin reports slice; acceptance = normal lint sees no i18n warning/error after baseline refresh and touched pages read copy from dictionaries; priority = high because the current baseline is ineffective.

BA: rules = Vietnamese UI copy remains Vietnamese-first, English kept only for approved identifiers/acronyms; copy source ladder stays glossary -> shared labels/messages -> app domain messages; edge case = legacy inline copy remains baselined, not silently treated as solved.

Dev: approach = add route-specific copy to `apps/web/lib/messages/admin.ts`, replace touched JSX literals with dictionary refs, then regenerate the legacy baseline; files = Admin reports pages, web ESLint config, i18n baseline; risk = large generated baseline diff.

QA: tests = summarize i18n counts before/after, run targeted ESLint with baseline, run `pnpm lint:copy`, then attempt full required gates; regressions to recheck = terminology source of truth and no new design-system/style drift.

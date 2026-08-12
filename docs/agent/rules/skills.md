# Skill And Tool Routing

Project sources decide policy. IDE plugins, global skills, MCP, and browser
tools only help execute it. This repository does not track a required skill
bundle under `.agents/`.

## Authority

1. `AGENTS.md`
2. Applicable `docs/agent/rules/*`
3. Sources mapped by `references.md`
4. External skills, plugins, MCP/browser tooling
5. Agent memory or local notes

Load the smallest capability that closes a known gap. External or global
skills cannot replace or modify repository authority. Do not recreate a
tracked `.agents/skills` tree or a parallel agent wiki.

## Routing

| Task signal | Primary source | Add an IDE/plugin skill only when |
| --- | --- | --- |
| App Router, RSC, Server Action | `engineering.md` | The framework boundary is in scope |
| React/Next performance patterns | `react.md` | A measured render or fetch hotspot exists |
| Shared component/accessibility | `ui.md` + design-system / archetypes | A reusable component contract changes |
| Vietnamese product UI copy, hints, bilingual drift | `language.md`, `docs/ref/glossary.md`, `lint:copy` | Writing or reviewing user-facing wording |
| Supabase, migration, RLS, RPC | `database.md` | Target is verified |
| Query/index/lock performance | `database.md` | A measured database hypothesis exists |
| Runtime UI/workflow proof | `ui.md`; Playwright when source cannot prove behavior | Browser proof is required |
| Monorepo pipeline/package graph | Root `package.json` + lockfile + turbo | More than one package boundary changes |
| Registry/preset work | `ui.md` + `packages/ui` | Registry configuration is the actual task |

## Safety

- Database tooling never overrides `database.md` target and mutation rights.
- Production browser sessions are read-only unless the owner delegates the exact
  mutation. Verify the backend/ref before runtime QA.
- Redact secrets, tokens, customer/employee data, and sensitive screenshots.
- Legal, tax, labor, payroll, and HĐĐT values start at
  `docs/ref/legal-framework-2026.md` and current official sources; stop when
  source, code, and law disagree.
- External UI advice follows the UI Advisor Gate in `ui.md` and cannot replace
  the Má Tư Design System.
- Unregistered runtimes stay read-only/plan/ask/sandbox. Never use force,
  skip-permissions, or accept-edits for a review lane.
- Subagent boundaries, non-overlap, and arbitration live in
  `orchestration.md`.

# Skill And Tool Routing Rules

Use this file before external skills, plugins, MCP/browser tools, or subagents.
Project rules decide what is allowed; tools only help execute the task.

## Authority Order

1. `AGENTS.md`
2. Applicable `docs/agent/rules/*`
3. Sources mapped by `references.md`
4. External skills, plugins, MCP/browser tooling
5. Agent memory or local notes

If a tool conflicts with the repo, the repo wins. Root adapter directories wire
tools back to these rules; caches, sessions, ignored skills, and MCP state are
not project authority. Load the minimum capability that closes a known gap.

## Skill Plan Gate

T3 tasks must state this before coding; T2 should when routing is not obvious:

```text
Skill plan: repo rules = engineering.md + <topic-rule>.md; external skills = <names or none>; runtime tools = <browser/db/cli>; skipped = <reason>.
```

Name only what the task actually uses. The repo-owned skill bundle is mandatory:
every fresh checkout must pass `corepack pnpm agent:skills` before agent work.
External plugins and MCP tools remain adapters, not substitutes for the bundle.

## Capability Registry

Capability keys are runtime-neutral contracts. Each maps to a required,
tracked skill in the `.agents/skills` bundle, locked by
`docs/agent/skills-manifest.json` and enforced by `lint:agent-skills`. A normal
task loads one primary capability and adds at most one specialist when it owns a
separate risk surface. Dormant capabilities are installed but require an explicit
task signal before loading.

| Capability              | Status     | Required repo skill                   | Load when                                                    | Skip when                                                     |
| ----------------------- | ---------- | ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `next-runtime`          | Primary    | `next-best-practices`                 | App Router, RSC, Server Action, route-handler work            | Copy-only or CSS-only change                                  |
| `ui-components`         | Primary    | `building-components`                 | Shared primitive, composition, or accessibility work          | Route-local layout with no component-contract change          |
| `supabase-runtime`      | Primary    | `supabase`                            | Supabase Auth, RLS, RPC, migration, or API work                | Target ref has not been verified                              |
| `runtime-qa`            | Primary    | `playwright`                          | UI or workflow behavior needs runtime proof                   | Source-only review is the requested outcome                   |
| `monorepo`              | Specialist | `turborepo`                           | Package graph, task pipeline, cache, or CI topology work       | Change stays inside one package                               |
| `postgres-specialist`   | Specialist | `supabase-postgres-best-practices`    | Query plan, index, lock, concurrency, or schema performance    | Ordinary Supabase API or RLS work                             |
| `react-performance`     | Specialist | `vercel-react-best-practices`         | A measured metric or bounded performance hypothesis exists    | Routine React implementation                                  |
| `registry-ui`           | Specialist | `shadcn`                              | Registry, preset, or `components.json` work                    | General Má Tư UI design or styling                            |
| `external-ui-review`    | Specialist | `web-design-guidelines`               | Advisory audit after the UI Advisor Gate                      | It would replace the Má Tư Design System                      |
| `next-cache`            | Dormant    | `next-cache-components`               | Cache Components is enabled or its adoption is explicitly scoped | General data-fetching or caching work                      |
| `next-upgrade`          | Dormant    | `next-upgrade`                        | The owner explicitly requests a Next.js upgrade               | Framework maintenance without a version change                |
| `ai-interface`          | Dormant    | `ai-elements`                         | An AI/chat product surface and its dependency are justified   | No product consumer exists                                    |

Do not stack `building-components`, `shadcn`, and
`web-design-guidelines` for routine UI work. Do not add the Postgres specialist
to ordinary Supabase work. Personal/global skills may add capability but cannot
replace or alter the tracked bundle.

## Bundle Governance

The bundle contains exactly the skills listed in the manifest. `lint` verifies
the complete tree and its SHA-256 lock; CI blocks a missing, extra, or drifted
skill. Any change to `.agents/skills/`, its manifest, or checker is T3
governance work. Do not rely on a developer's global skill cache, plugin catalog,
or MCP state for project behavior.

## Routing Matrix

| Signal                          | Repo authority                                                                             | Capability                                                      | Verification                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| Broad orientation               | `engineering.md`, `references.md`, `docs/CODEBASE_MAP.md`                                  | CodeGraph first when indexed                                    | Evidence paths; runtime claims need runtime proof   |
| Review/regression               | `workflow.md`, relevant module/spec, targeted regressions                                  | Read-only reviewer only when it adds evidence                   | Findings with file/line and targeted checks         |
| Next.js/React/Server Actions    | `engineering.md`; `database.md` if data/auth                                               | One relevant framework skill when needed                        | Typecheck, lint, build                              |
| UI/UX/route/copy                | `ui.md` and its routed SSOTs                                                               | Smallest distinct reviewer set; browser after UI Advisor Gate   | Runtime/browser smoke for meaningful UI             |
| Supabase/migration/RLS/auth/RPC | `database.md`, `workflow.md`, schema docs                                                  | Supabase/Postgres capability after ref verification             | T3; migration first; types after applied schema     |
| Money/legal/tax/labor           | `legal-framework-2026.md` first, then the mapped domain ref + `database.md`, `workflow.md` | Official/current sources; existing compute code before new math | T3; cite governing source; stop on doc/code drift   |
| Browser QA                      | `workflow.md`, relevant UI/module docs                                                     | Browser/Playwright                                              | URL, viewport, state, action, blocker               |
| Deploy/CI/PR                    | `engineering.md`, `workflow.md`, runbook                                                   | GitHub/Vercel only for requested operation                      | CI/deploy evidence; no inferred production mutation |
| Agent/runtime fan-out           | `orchestration.md`                                                                         | Smallest bounded lane                                           | Evidence-only reviewers; isolated writers           |

## Safety Boundaries

- Database tools never override `database.md` target rights.
- Before browser QA, verify the backend/ref. Default to Local or Preview.
  Production browser sessions are read-only navigation unless the owner delegates
  the exact mutating action. Never infer permission to submit or destroy data.
- Redact secrets, tokens, customer/employee data, and sensitive screenshots.
- Legal/tax/labor numbers come from the governing repo source or current official
  source, never memory.
- Tax/payroll/HĐĐT routing is repository-owned: start at
  `docs/ref/legal-framework-2026.md`, then load the task-specific source mapped in
  `references.md`. Reuse the versioned payroll and invoice-provider code named by
  those docs; if law, domain docs, and code disagree, stop for owner/accountant
  resolution instead of silently choosing one.
- Complete the UI Advisor Gate before external design advice. External UI output
  cannot replace Má Tư Design System as runtime SSOT. Allowed Stitch/agent
  mirror only: `.stitch/DESIGN.md` (seeded from `docs/spec/design-system.md`).
  Root `DESIGN.md` and `design-systems/` remain forbidden. Stitch skills are
  external adapters (allow: `extract-design-md`, `generate-design`,
  `manage-design-system`, `upload-to-stitch`, `enhance-prompt`; deny as
  authority: `shadcn-ui`, `stitch-loop`, `taste-design`). Do not add stitch
  skills to the locked `.agents/skills` bundle without T3 governance.
- Unregistered external runtimes use read-only/plan/ask/sandbox mode for review.
  Never use force, yolo, skip-permissions, or accept-edits for a review lane.

## Anti-Patterns

- Choosing a tool because it is installed.
- Stacking overlapping skills or reviewers.
- Creating a second design system, DB policy, task board, memory store, rule tree,
  or architecture record (`.stitch/DESIGN.md` is a mirror of Má Tư DS, not a
  second product DS).
- Claiming a tool was used when its instructions or output did not affect work.

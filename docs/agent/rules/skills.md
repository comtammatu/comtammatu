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

Name only what the task actually uses. Do not install, vendor, or pin a skill or
plugin unless the owner asks.

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
  cannot replace Má Tư DS or create tool-specific context/design files.
- Unregistered external runtimes use read-only/plan/ask/sandbox mode for review.
  Never use force, yolo, skip-permissions, or accept-edits for a review lane.

## Anti-Patterns

- Choosing a tool because it is installed.
- Stacking overlapping skills or reviewers.
- Creating a second design system, DB policy, task board, memory store, rule tree,
  or architecture record.
- Claiming a tool was used when its instructions or output did not affect work.

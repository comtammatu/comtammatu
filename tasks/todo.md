# Current Tasks

> Active tracker for the Greenfield preparation cut.
> No historical backlog, deferred idea list, shipped history, or dated planning
> archive lives here. Shipped history lives in git; durable failure rules live
> in `tasks/regressions.md`; durable lessons live in `tasks/lessons.md`.
>
> Reconciled-through `23500913b` (2026-07-08). Before acting, verify the live
> checkout with `git status` and re-check production state for any migration or
> runtime claim.

## Operating Frame

- Production baseline remains the current `comtammatu` app and production
  Supabase ref `iexwsuaqqenyjiskawoj`. Agents do not mutate production by
  default.
- Greenfield is a separate preparation track. Do not copy old `docs/plan/*`,
  `docs/worklog/*`, external-skill plans, or memory decisions into it unless the
  owner promotes that fact again.
- Candidate Greenfield Supabase target remembered from prior owner context:
  `jmasiwuqiyedqvyfzhuq`. Treat it as unverified until the connector/dashboard
  confirms it and the Environment Registry is updated. No writes before then.
- Active work must be one of the gates below or a fresh owner-confirmed blocker.
  Everything else belongs in code, canonical docs, tests, runbooks, or nowhere.

## Active Greenfield Gates

- [ ] **G0 — classify the dirty working tree.** For every changed file and new
  migration, decide `keep for production`, `port to Greenfield`, or `drop`.
  Do not start a schema copy while mixed production WIP is unresolved.
- [ ] **G1 — verify the Greenfield environment.** Confirm the active project ref,
  access posture, and connector visibility. Add the target to
  `docs/agent/rules/database.md` only after owner confirmation.
- [ ] **G2 — derive from the current schema baseline only.** Build Greenfield from
  the current schema/baseline contract, not from historical plans. Any
  `supabase/greenfield/` material is rehearsal-only unless promoted.
- [ ] **G3 — re-derive the product spine.** Freshly confirm the minimal spine:
  owner/auth, branch context, POS -> payment -> KDS/print -> HĐĐT, inventory
  receive/production/stocktake, and HR/payroll basics. Anything outside this
  spine needs a fresh owner decision.
- [ ] **G4 — define runtime smokes.** One real-auth smoke per spine flow, using
  current scopes and current routes. Keep the proof as tests or a runbook, not a
  backlog essay.
- [ ] **G5 — keep docs lean.** Source-of-truth docs are `AGENTS.md`,
  `docs/agent/rules/`, `docs/CODEBASE_MAP.md`, `docs/modules/`, `docs/spec/`,
  `docs/ref/`, `docs/runbooks/`, `docs/plan/decisions.md`,
  `docs/plan/adr/`, and `tasks/{todo,regressions,lessons}.md`. Do not add dated
  plan/worklog archives.

## Removed From The Board

- Historical production backlog, `Deferred Post-Pilot`, `Post-v1.0` ideas,
  dated plans, worklog transcripts, and external-skill execution plans were
  removed on 2026-07-08. Git history is the record.

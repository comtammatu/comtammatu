# Multi-Agent Operating Team And Cross-Runtime Orchestration

This file adds ONE concern on top of the existing rules: a **standing operating team** (named roles and missions that persist across tasks) and a **cross-runtime orchestration protocol** (how Claude and Codex hand work between them). It instantiates the review and routing rules as a team; it does not redefine them.

Read this AFTER `AGENTS.md` and the rule files it routes to. It is a connector, not a copy: every stage, role, and mission points at the file that owns the detail. If a sentence here appears to set a tier, a perspective, a routing entry, a gate, or a constraint, treat it as a stale duplicate and follow the owning file instead.

## Purpose & Scope

This file OWNS:

- The standing team of roles — Orchestrator/Tech Lead, the four review lenses as standing roles, the repo-specific specialist flexes, and the second runtime — each given a mission and a runtime, with every tier / perspective / skill / constraint linked to its owner.
- The standing missions tied to the live tracks on the work board.
- The end-to-end operating loop and the cross-runtime orchestration protocol: when to invoke a second runtime, which mode, the handoff, arbitration, safety, and the single-agent fallback.

This file does NOT own — point here, never restate:

| Fact | Single owner |
| --- | --- |
| Review tiers (T3 / T2 / T1), their triggers, and how each tier runs the lenses | [`workflow.md`](workflow.md) → Review Depth — Tier By Risk |
| The four-perspective definitions and lead questions; flex-the-lens; Cross-Boundary Coherence | [`workflow.md`](workflow.md) → The Four Perspectives |
| T3 trigger surfaces (auth/RLS, money, multi-row writes, `SECURITY DEFINER`, schema migration, backfill) | [`workflow.md`](workflow.md) → Review Depth; deterministic floor `pnpm lint:review-tier` |
| Skill Plan Gate; Required Routing Matrix; per-domain skill rules; the `codex` / `cso` / `review` skill behavior; Subagents-Debate-Read-Delegation; the Agent Teams note | [`skills.md`](skills.md) |
| Verification gates and the exact gate command; `pnpm verify`; self-attestation; tier floor; CI; the learning-loop hygiene | [`workflow.md`](workflow.md) → Verification |
| Promote-and-delete; memory store boundaries | [`references.md`](references.md) → Memory Maintenance Rules |
| Core Constraints (`MIRROR:constraints`), Import Boundaries, URL/proxy/JWT, Git & Commit Conventions | [`engineering.md`](engineering.md) and the `MIRROR:*` blocks in [`AGENTS.md`](../../../AGENTS.md) |
| Environment Registry; prod ref SELECT-only; migration file → PR → owner-applies flow and its owner-delegated exception; RLS / ACL / RPC rules | [`database.md`](database.md) |
| The prod-DB guard triad, the `MIRROR` blocks, their drift guards, and the per-runtime entrypoints / guard adapters | [`references.md`](references.md) → Agent Entrypoints Per IDE, Intentional Mirrors |
| UI / design-system contract routing | [`ui.md`](ui.md) and [`AGENTS.md`](../../../AGENTS.md) → UI Authority |
| The active work board | [`tasks/todo.md`](../../../tasks/todo.md) |

One fact, one owner. If a role here needs a tier, it links to `workflow.md`; if it needs a skill, it links to the matrix in `skills.md`; if it needs a constraint, it links to `engineering.md` or `database.md`.

## Runtime Model

Two co-equal runtimes execute this team layer: **Claude Code** (entrypoint `CLAUDE.md` → `AGENTS.md`) and **Codex** (entrypoint `AGENTS.md` native). Each loads its own entrypoint and wires the same canonical prod-DB guard; see [`references.md`](references.md) → "Agent Entrypoints Per IDE".

- **Orchestrator is a role, not a runtime.** Whichever agent owns a task is its Orchestrator: it picks the tier ([`workflow.md`](workflow.md)), writes the skill plan ([`skills.md`](skills.md)), runs or writes the four-perspective debate, decides when to pull in the second runtime, and lands the change through the verification gates. Either runtime can be Orchestrator; a session has exactly one at a time.
- **Second opinion is the other runtime**, brought in as an independent reviewer. The disagreement between two independently-reasoning runtimes is the value; see Arbitration.
- **Agent Teams is an optional Claude-only accelerator.** No role, mission, loop stage, or gate in this file may depend on it — that rule is owned by [`skills.md`](skills.md) → Subagents, Debate, And Read Delegation. Everything here works with a single agent writing transcripts.

### Runtime-Neutral Mandate

Every role and loop below MUST execute identically whether run by Claude, by Codex, or by a single agent with no subagent support:

- Express coordination as **artifacts**, not live channels: the debate transcript, the skill plan, the PR body, the worklog note, [`tasks/todo.md`](../../../tasks/todo.md). Anything a live team would say in a channel must survive as one of these.
- The **written-transcript fallback is the canonical form, not the degraded one.** When subagents or Agent Teams are unavailable, the Orchestrator writes the four perspectives and any second-opinion exchange itself, in English ([`AGENTS.md`](../../../AGENTS.md) → Communication Protocol), and states which capability was unavailable. A reviewer reading only the artifacts must be able to reconstruct the whole decision (see [`workflow.md`](workflow.md) → Running A T3 Full Debate and [`skills.md`](skills.md) → Subagents, Debate, And Read Delegation).
- A Codex-only session and a Claude-only session run the SAME loop and produce the SAME artifacts. The only difference is which capability the fallback note records as missing. No mission, role, or step may become unreachable in single-agent mode.

## Roles — The Standing Team

A "role" here is a lens the work passes through and a standing responsibility, not a separate agent. One agent may wear several hats in a session; a T3 debate splits them across subagents when the runtime supports it, and writes them out as a transcript when it does not. The four review lenses default to PM / BA / Senior Dev / QA and FLEX to the blast radius that triggered the tier — that flex rule lives in [`workflow.md`](workflow.md); the specialist rows below are named instances of it for this repo's real risk surfaces.

### Orchestrator / Tech Lead

The main agent thread (Claude or Codex), runtime-neutral. Mission: take a request from intake to a verified, gate-green change with the learning loop closed. Owns the connective tissue between the owned files — intake & restate; tier selection (per [`workflow.md`](workflow.md)); the skill plan ([`skills.md`](skills.md) gate); role assignment; fan-in synthesis (agreements → conflicts-resolved → unified contract, per [`workflow.md`](workflow.md)); the verification gate; and one learning-loop pass. Lead question: "What tier is this, who are the lenses, and what single contract do we verify against?" Routes skills by the matrix in [`skills.md`](skills.md) and reaches for `codegraph_explore` / read-delegation before broad reads ([`skills.md`](skills.md) → context economy).

### The Four Review Lenses (as standing roles)

PM, BA, Senior Dev, QA/QC. Definitions, owned concerns, and lead questions are in [`workflow.md`](workflow.md) → The Four Perspectives — **not restated here**. How each tier runs them (T3 spawn-or-transcript, T2 inline, T1 skip-with-reason) is also owned by [`workflow.md`](workflow.md) → Review Depth.

The only net-new note: the **QA/QC lens is the natural seat for the cross-runtime Independent Reviewer** (see Codex Orchestration Protocol) — its cross-boundary-coherence job is exactly what a separate-model pass strengthens. Any lens runs on either runtime.

### Repo-Specific Specialist Lenses

Each is a *flex* of the four lenses (per [`workflow.md`](workflow.md)'s flex rule) onto a real risk surface in this codebase. Skills and constraints are referenced, never duplicated — the authoritative routing is the matrix in [`skills.md`](skills.md), and the rules each lens guards live in their owner files.

| Specialist lens | Mission (what it guards) | Lead question | Routing & rules |
| --- | --- | --- | --- |
| **Data/DB & Migration steward** | Schema changes stay safe, ordered, and type-synced; the DB↔API↔TS contract holds. | "Is this migration reversible, ordered, and does every column still match its API field and TS type?" | Supabase rows of the matrix ([`skills.md`](skills.md) → Supabase); migration policy and the no-default-prod-apply rule owned by [`database.md`](database.md). |
| **Security & Prod-Guard** | Prod data and the guard triad stay protected; no privilege escalation or data leak. | "Can this leak, escalate, or run against prod unguarded?" | Security audit via the `cso` row ([`skills.md`](skills.md)); RLS/ACL/grants, the guard triad, and MCP read-only posture owned by [`database.md`](database.md) → Environment Registry and [`references.md`](references.md) → Intentional Mirrors. |
| **Domain / HKD-Tax** | Tax / HĐĐT / payroll behavior stays legally correct for a Hộ kinh doanh; no rate, threshold, or deadline asserted from memory. | "Which văn bản governs this, and does code match the doc?" | [`skills.md`](skills.md) → HKD Domain (routes the legal docs, recites no number). |
| **UI / Design-System** | Operational surfaces stay inside the locked Custom Theme; no second design system. | "Does this fit the Custom Theme, or is it inventing one?" | [`skills.md`](skills.md) → Shadcn And UI Design; [`AGENTS.md`](../../../AGENTS.md) → UI Authority; [`ui.md`](ui.md). |
| **Print / Integration** | The print pipeline and external providers (VietQR / Momo / Viettel HĐĐT) stay coherent end to end and fail loud. | "Are all three sides of the print/provider mirror in sync, and are failures fail-loud?" | [`skills.md`](skills.md) → Browser And QA for smoke; engineering + relevant module docs. |

Every specialist lens runs on either runtime and inherits the same constraints as everyone else — the migration, MCP, and guard rules in their owner files apply unchanged.

### Codex As A Co-Equal Runtime

Codex is not a tool the team calls — it is a second runtime that can hold the main thread itself OR plug into a Claude-led session. Its distinct value is *independence*: a separate model reviewing the same diff catches what the author rationalized. The protocol is symmetric — read "Codex" as "the other runtime"; a Codex Orchestrator invoking Claude follows the same triggers, handoff, and arbitration.

| Hat | Mission | When the Orchestrator reaches for it | Mode (→ [`skills.md`](skills.md)) |
| --- | --- | --- | --- |
| **Independent Reviewer** | Pass/fail gate on a diff from a separate model. | Every T3; any diff the author wants a second opinion on before landing. | `codex` review mode; the `review` skill row. |
| **Challenger** | Adversarially try to break the change. | The highest-blast-radius T3 work (see [`workflow.md`](workflow.md) → Review Depth for which surfaces qualify). | `codex` challenge mode. |
| **Consultant** | Answer an open design/architecture question with session continuity. | A stuck design decision; a tradeoff the single thread cannot resolve; before a `docs/plan/decisions.md` D0xx. | `codex` consult mode. |
| **Parallel implementer** | Own a separable slice while the other runtime owns another. | Only when slices are truly independent (e.g. one PR per file). | Normal repo rules; atomic per-task staging ([`engineering.md`](engineering.md) → Git). |

The second runtime inherits every constraint of the first — no relaxed posture for "it's just a reviewer". It has no Agent Teams, so any Codex involvement uses the written-transcript fan-in. Prod-migration and MCP posture are owned by [`database.md`](database.md) (default flow file → PR → owner; owner-delegated apply is the only exception); see Safety.

## Missions — Standing Objectives

Standing commitments the team holds beyond any single request. The board [`tasks/todo.md`](../../../tasks/todo.md) is the single owner of the live task list and status — these missions point at it; they do not duplicate or re-track the tasks.

| Mission | Objective | Owning lens(es) | Definition of done | Tracked on |
| --- | --- | --- | --- | --- |
| **Keep the gate green** | The hard gate stays passing on every landed change. | Orchestrator | The hard gate in [`workflow.md`](workflow.md) → Verification passes and CI is green on the PR. | The PR / CI; standing — not a board row. |
| **HRM per-shift correctness** | Two-shifts-per-day attendance, checklist-by-position, and `công = Σ ca/2` are correct and stay correct. | Data/DB & Migration steward + Senior Dev + QA | The HRM per-shift / redesign tracks reach their stated done-state with gates green and the per-shift contract honored; behavior-verify when a non-prod env is available. | The HRM per-shift and payroll rows on [`tasks/todo.md`](../../../tasks/todo.md); decisions in [`decisions.md`](../../plan/decisions.md) D026/D027/D031. |
| **Prod-DB safety & migration discipline** | No agent mutates prod by default; every migration is file → PR → owner; the guard triad stays wired. | Security & Prod-Guard + Data/DB steward | Migrations land as files only (owner-delegated apply is the sole exception, per [`database.md`](database.md)); `lint:guard-sync` passes; `db:types` run after the type-source schema is applied. | The owner-gated migration / dead-RPC / residual-grant rows on [`tasks/todo.md`](../../../tasks/todo.md). |
| **HĐĐT / tax compliance** | Tax, payroll, and HĐĐT behavior stays legally correct for a HKD; no rule asserted from memory. | Domain / HKD-Tax | Every money/tax/HĐĐT/payroll change cites its văn bản via the [`skills.md`](skills.md) → HKD Domain routed docs, runs the full T3 debate, and flags doc↔code disagreement to the owner instead of silently reconciling. | The active HĐĐT rows on [`tasks/todo.md`](../../../tasks/todo.md); `docs/ref/legal-framework-2026.md`. |
| **Doc SSoT hygiene** | One fact, one store; no parallel agent-doc tree; mirrors and guards stay synced. | Orchestrator | New durable facts land in their canonical doc ([`references.md`](references.md) → Memory Maintenance Rules); `lint:rules-mirror` + `lint:guard-sync` pass; staging files shrink as rules mature. | [`references.md`](references.md) → Memory Maintenance Rules; `tasks/lessons.md`, `tasks/regressions.md`. |

## The Operating Loop

One task moves through nine stages. Each stage is a connector to the doc that owns its rules — the arrow is the only thing this file contributes. The loop is identical regardless of runtime or how many agents run it.

```text
  ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────┐
  │ 1 INTAKE │──▶│ 2 TRIAGE & │──▶│ 3 SKILL    │──▶│ 4 ROLE       │
  │          │   │   TIER     │   │   PLAN     │   │   ASSIGNMENT │
  └──────────┘   └────────────┘   └────────────┘   └──────┬───────┘
   todo.md /      workflow.md       skills.md        (this file:
   owner          T1/T2/T3          Skill Plan Gate   Standing Roles)
                                                            │
  ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌───────▼──────┐
  │ 9 LEARN  │◀──│ 8 LAND     │◀──│ 7 VERIFY   │◀──│ 5 IMPLEMENT  │
  │          │   │            │   │            │   │              │
  └──────────┘   └─────┬──────┘   └─────┬──────┘   └───────┬──────┘
   regressions.md/      engineering.md   workflow.md        engineering.md
   lessons.md +         git conv. +      Verification +     MIRROR:constraints
   workflow.md          database.md      gate                     │
   learning loop        owner gate              ▲                 ▼
                                                │          ┌──────────────┐
                                                └──────────│ 6 X-RUNTIME  │
                                                           │   REVIEW     │
                                                           └──────────────┘
                                                          (this file: Codex
                                                           Orchestration)
```

1. **Intake** — A task enters from the owner or from [`tasks/todo.md`](../../../tasks/todo.md). The Orchestrator restates the request and the surfaces it touches.
2. **Triage & tier** — Classify blast radius and pick the lenses. *Owns:* [`workflow.md`](workflow.md) → Review Depth (tier table, flex-the-lens rule). The floor `pnpm lint:review-tier` catches under-classification. This file never restates a tier.
3. **Skill plan** — Write the skill-plan line (repo rules + external skills + runtime tools). *Owns:* [`skills.md`](skills.md) → Skill Plan Gate, Required Routing Matrix. Mandatory for T3, expected for T2.
4. **Role assignment** — *This file's stage.* Assign the standing roles and pick the four lenses, flexing to the specialist rows above when the trigger surface calls for it. For T3, spawn the four perspectives (parallel subagents / Agent Teams if available). If neither subagents nor Agent Teams are available (e.g. a Codex session), the Orchestrator writes the four perspectives inline as a transcript — this is the canonical form, not a degraded one.
5. **Implement** — Write the code under the `MIRROR:constraints`. *Owns:* [`engineering.md`](engineering.md) (Core Constraints, Import Boundaries, URL Structure). Database work additionally obeys [`database.md`](database.md); UI additionally obeys [`ui.md`](ui.md).
6. **Cross-runtime review** — *This file's stage; see Codex Orchestration Protocol.* The Reviewer runs an independent pass on the diff. *Skill routing owned by* [`skills.md`](skills.md); *review depth owned by* [`workflow.md`](workflow.md).
7. **Verify** — Run the gates. *Owns:* [`workflow.md`](workflow.md) → Verification (hard gate, `pnpm verify` for release slices, cross-boundary coherence, self-attestation, tier floor, CI). Do not mark complete until they pass and CI is green. This file restates no gate.
8. **Land** — Stage atomically, commit, land. *Owns:* [`engineering.md`](engineering.md) → Git And Commit Conventions. Prod and migration steps are **owner-gated**: by default agents do not apply prod migrations — file → PR → merge → owner applies; the only exception is the owner-delegated apply in [`database.md`](database.md) → Owner-Delegated Production Apply. *Owns:* [`database.md`](database.md) → Environment Registry, Migration Policy.
9. **Learn** — One learning-loop pass before closing. *Owns:* [`workflow.md`](workflow.md) (learning-loop hygiene) routing to `tasks/regressions.md` and `tasks/lessons.md`; promotion-and-delete in [`references.md`](references.md) → Memory Maintenance Rules. State the learning (or "none") in the commit/PR body.

A single agent walks all nine stages itself; a team distributes them across roles; a Claude↔Codex split typically puts Implement on one runtime and stage 6 on the other. Owner-facing synthesis is Vietnamese; agent-to-agent transcripts are English ([`AGENTS.md`](../../../AGENTS.md) → Communication Protocol).

## Codex Orchestration Protocol (Stage 6)

The cross-runtime review pass is the one genuinely new mechanism this file owns: when a Claude-led task pulls in Codex (or a Codex-led task pulls in Claude) as an independent reviewer. It is an **independent second pass**, not a replacement for the four perspectives or the verification gates. Route the mode through [`skills.md`](skills.md) → "Code review, PR review, regression hunt" and the `codex` skill (review / challenge / consult).

### When To Invoke The Second Runtime

Invoke a second-runtime pass when it materially de-risks the change:

- **Every T3 gets one independent second-runtime pass** before landing, in ADDITION to the four perspectives. T3 and its trigger surfaces are defined in [`workflow.md`](workflow.md) → Review Depth.
- **Any diff on a T3 trigger surface that self-classified below T3** — a second runtime is the cheapest catch for an under-classified diff, complementing the `pnpm lint:review-tier` floor ([`workflow.md`](workflow.md)).
- **Large or ambiguous diffs** — wide blast radius, cross-boundary changes (the Cross-Boundary Coherence classes in [`workflow.md`](workflow.md)), or a diff where the Orchestrator's own confidence is low.
- **Architecture forks** — a decision with two defensible paths that would land in `docs/plan/decisions.md` (a D0xx). Use `consult` before committing to one.
- **Discretionary** — any time a second independently-reasoning runtime would catch a class of error the first is blind to. The disagreement is the product.

T1 may skip the pass; state the skip in the commit body (per [`workflow.md`](workflow.md)).

### Modes Mapped To Team Moments

The three `codex` modes (see [`skills.md`](skills.md)) map to specific moments:

| Mode | Team moment | When |
| --- | --- | --- |
| `consult` | Architecture fork, before a D0xx; "is this approach sound"; design question | Early — before/while shaping the plan, in the T3 debate or T2 self-review |
| `challenge` | Adversarial pass before landing the highest-risk diffs | Late — after implementation, before merge, on the T3 trigger surfaces ([`workflow.md`](workflow.md)) |
| `review` | The pre-land independent diff review with a pass/fail gate | Late — the standard second-runtime gate on every T3 and the surfaces above |

`challenge` and `review` can both run on one change: `review` for the structured pass/fail, `challenge` to actively try to break a high-risk path. Do not stack modes that cover the same risk surface ([`skills.md`](skills.md) → "Load the minimum useful set").

### Handoff Format

Hand the second runtime the SAME structured context a T3 subagent gets — that context list is owned by [`workflow.md`](workflow.md) → Running A T3 Full Debate — in English ([`AGENTS.md`](../../../AGENTS.md) → Communication Protocol), so its pass is reproducible from the artifact alone. The minimum is: the task one-liner plus tier-and-why; the diff paths and key dependencies; the relevant `MIRROR:constraints` rows; the skill plan; the relevant `tasks/regressions.md` rows; and the ask (which mode + the specific question or pass/fail criteria). For money/tax/HĐĐT context, route the law citations through [`skills.md`](skills.md) → HKD Domain; never paste a rate or threshold from memory into the handoff.

### Arbitration

A Claude↔Codex disagreement is a feature, not a failure — it surfaced a real ambiguity. Resolve it on evidence, not authority:

1. **Reproduce.** The agent claiming a defect provides a concrete repro, a file/line, or a failing check. A claim without evidence does not win.
2. **Re-debate the contested point only**, through the relevant [`workflow.md`](workflow.md) lens (flex-the-lens picks it). Update the artifact with the resolution.
3. **Tie-break.** If evidence does not settle it AND the change is T3, escalate to the owner (Vietnamese reply per [`AGENTS.md`](../../../AGENTS.md) → Communication Protocol) with both positions stated plainly. Below T3, the Orchestrator decides and records the trade-off.
4. **Record.** Write the resolution — what each runtime argued, the evidence, the final call — in the PR body (T3) or the `docs/worklog/` note. A durable architecture choice becomes a `docs/plan/decisions.md` D0xx; a recurring defect class becomes a `tasks/regressions.md` rule or a guard ([`workflow.md`](workflow.md) → learning loop). Never resolve silently.

### Safety

The second runtime is bound by the same safety net as the first — there is no relaxed posture for "it's just a reviewer". The whole posture is owned elsewhere; this is the pointer:

- **MCP posture is per-server, not blanket.** Codex's `.codex/config.toml` Supabase MCP is pinned `read_only=true`; the repo-scoped Claude `.mcp.json` entry and the org-scoped / Supabase-CLI paths are NOT read-only and are gated by the deny-list plus the `guard-prod-db.mjs` hook. Re-check the ref before any write-capable call ([`database.md`](database.md) → Environment Registry).
- **Neither runtime applies prod migrations by default.** Flow is file → PR → merge → owner applies. The ONLY exception is [`database.md`](database.md) → Owner-Delegated Production Apply (owner authorizes a prod write in the current session). This file sets no looser or stricter rule than `database.md`; a routine second-runtime pass reviews a migration FILE and a PR.
- **Both runtimes inherit the single guard triad.** The guard, its adapters, the `lint:guard-sync` drift check, and the rule that a new IDE needs a registered adapter before use are owned by [`references.md`](references.md) → Intentional Mirrors and Agent Entrypoints Per IDE. A second runtime inherits the guard; it does not get a private bypass.

### Fallback

If only one runtime is available, the loop does not change — only its execution does:

- The Orchestrator writes the second opinion itself as a debate transcript (per [`workflow.md`](workflow.md)), adopting the adversarial / consult / review stance the moment called for, and notes which runtime was unavailable (e.g. "Codex unavailable this session; second-opinion pass written single-runtime").
- The fallback note lives where the real pass would have — PR body (T3) or `docs/worklog/` note. The pass/fail gate and the arbitration record still apply; a single agent argues both sides and resolves on the same evidence standard.
- A self-written second opinion is weaker than a genuinely independent runtime — state that limitation in the note so the owner can weigh it for high-risk changes.

## Coordination & Concurrency

When more than one agent (or runtime) works the same tree:

- **Atomic staging.** Stage and commit only the files your task owns; never `git add -A` across another agent's in-flight work. Commit conventions, authorship, and the `Verification:`/tier note in the commit body are owned by [`engineering.md`](engineering.md) → Git & Commit Conventions — this is only the pointer.
- **One PR per file for risky splits.** When a risky change (migration, RLS, money, `SECURITY DEFINER`) is split across agents, keep each agent's slice on its own PR/file boundary so the cross-runtime review and arbitration have a clean, attributable diff. Do not interleave two risky changes in one PR.
- **[`tasks/todo.md`](../../../tasks/todo.md) is the single progress board.** Claim, update, and close work there — it is the one shared, runtime-neutral coordination surface (Claude, Codex, and any future runtime read it identically). Do not fork a parallel tracker, a gstack-side store, or a private-memory task list ([`skills.md`](skills.md) → Anti-Patterns; [`references.md`](references.md) → Memory Maintenance Rules). Regression rules go to `tasks/regressions.md`, durable lessons to `tasks/lessons.md`, architecture decisions to `docs/plan/decisions.md`, per the learning loop in [`workflow.md`](workflow.md). Worklogs (`docs/worklog/`) are per-task staging, not a second board.

## Anti-Patterns

- **No duplication of the owner files.** Restating a tier, a four-perspective definition, the skill matrix, a verification gate or its command string, or a constraint here instead of pointing at its owner. If a stage needs one, it links — see Purpose & Scope.
- **No governance dependent on Agent Teams or parallel subagents.** Roles, missions, the loop, and the cross-runtime pass MUST work single-agent and on Codex, with a written-transcript fallback. Agent Teams is an optional accelerator ([`skills.md`](skills.md) → Subagents), never a precondition.
- **No prod write by default, and no blanket "MCP is read-only".** Stage 8 is owner-gated: file → PR → merge → owner applies, with the single owner-delegated exception in [`database.md`](database.md). MCP read-only is per-server, not universal (see Safety). The guard triad is the backstop.
- **No parallel agent-doc tree or second store.** Do not spin up `docs/llm-wiki/`, a second learning/config store, or a parallel progress tracker instead of the canonical homes in [`references.md`](references.md). Do not track loop state in this file.
- **No tombstones, no narrative.** No change-log, no "previously the team did X" notes, no provenance for deleted roles (`MIRROR:constraints`).
- **No forking the guard or the mirrors.** Do not add a second prod-DB guard, a second mirror block, or a per-runtime copy of these rules. Enforcement stays the single `scripts/guard-prod-db.mjs` and the existing `lint:rules-mirror` / `lint:guard-sync` triad ([`references.md`](references.md) → Intentional Mirrors).
- **No second design/UI authority and no skill-as-authority.** Cross-runtime review obeys the same Authority Order as everything else: repo wins over any external skill ([`skills.md`](skills.md)). Choosing roles or skills by agent preference rather than by the triggering surface and the routing matrix is out of bounds.

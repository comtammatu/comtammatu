# ADR 0021 — Bounded self-improving project operating loop

**Status:** Proposed

**Decision owner:** Owner

**Scope:** One bounded knowledge-closeout decision for `comtammatu`, plus a
sequenced but separately owner-gated recovery roadmap for verification, tests, and
agent tooling.

**Authority boundary:** Accepting this ADR records an architecture decision only. It
does not authorize Wave 1 implementation, Production mutation, database migration,
deployment, commit, or push. Every delivery slice requires explicit owner delegation
and remains subject to its own review tier, target verification, and owner gates.

## Executive decision

The project does not need another agent framework, memory store, task board, or
standing reviewer team. It needs one bounded closeout loop that makes existing
knowledge stores self-reducing:

```text
work -> proof -> observation -> encode once -> delete staging -> next work
                  |                |
                  |                +-> owning doc, behavior test, or safety guard
                  +-> no durable signal -> `Loop: none`
```

`docs/agent/rules/workflow.md` will own that lifecycle. T2 and T3 closeout will
state exactly one of:

```text
Loop: none
Loop: observed <sanitized signal> -> encoded at <repo-relative path or stable id> -> deleted <repo-relative path or none>
```

The second form is valid only when encoding and deletion happen in the same
change. The first form is healthy; it prevents ritual lessons from being invented
for ordinary work.

Accepting this ADR records only the lifecycle owner, the closeout pilot, atomic
promotion/deletion, and the direction for repairing proven lifecycle drift. A separate
owner delegation is still required to implement Wave 1. Verification backlog,
test/guard slimming, and agent-startup work remain separate owner-approved outcomes.
They are sequenced here so the project has one direction without pretending those
independent costs share one root cause.

## Context and evidence

The owner's premise is that lessons are being forgotten, rules and agent structure
are steering work into fixed paths, and the repository is growing while sources
disagree. Current repository evidence supports the premise, with one correction:
the lifecycle still exists in prose, but its mandatory closeout trigger disappeared.

Snapshot observed on 2026-08-01:

| Signal | Current evidence | Consequence |
| --- | --- | --- |
| Closeout trigger disappeared | Before `832a0aad2`, T2/T3 verification required a bounded learning pass and a learning-or-none declaration. Current `workflow.md` only says to promote durable outcomes. Across the 272 commits after that change, no commit body contains `Learning:`. | Capture depends on memory again. |
| Command adapter is stale | `.claude/commands/verify-gate.md` asks for workflow steps 1-7, cites `tasks/lessons.md` items 3-4, and asks for a learning-or-none result. The current workflow and lesson numbering no longer match those references. | An adapter can confidently execute obsolete instructions. |
| Lesson staging is not draining | `tasks/lessons.md` says to promote and delete. Entries 3, 4, and 36 already overlap stable database, Inventory, UI, or test contracts; numbering jumps from 4 to 36. | The same fact is re-read from multiple owners. |
| Regression policy contradicts itself | The cleanup policy says a CI-enforced regression row is redundant and should be deleted, while the code-enforced section says rows and guards must stay synchronized. Its manual list omits `INVENTORY-LEDGER-RPC-ONLY`, although the guard reports seven rules. | Agents cannot tell whether enforcement retires or preserves prose. |
| Regression references drift | `tasks/regressions.md` names a missing `apps/web/tests/supplier-invoice-valuation-static.test.ts`; `scripts/list-regression-retire-candidates.mjs` refers to stale numbered policy items and a nonexistent `Lint-anchor rules` heading. | Passing lint does not prove documentation references are live. |
| Proof debt dominates active work | `tasks/todo.md` has 31 outcomes: 24 `verify`, 2 `doing`, 3 `blocked`, and 2 `triage`; 27 are T3. | New implementation starts faster than completed proof closes. |
| Gate volume is high | Root `lint` runs 18 custom stages before package lint. `apps/web/tests` contains 177 `*static.test.ts` files with 22,692 lines. Across the current test tree, 290 of 377 test files call `readFileSync`. | Source shape is often frozen in place of behavior, and cross-package Turbo inputs can be stale. |
| Tooling is duplicated and heavy | The tracked skill bundle contains 334 files. `.codegraph` is 803.61 MB. `agent:start` always invokes `codegraph index .` even when `codegraph status -j` reports zero pending changes. Rules disagree between every implementation task and every fresh checkout. | Startup pays repeated work and the routing surface is harder to change. |
| Written policy does not reliably become behavior | `engineering.md` forbids AI attribution, yet 35 commits after `832a0aad2` contain `Co-authored-by: Cursor`. | A rule that matters must be enforced or removed; prose alone is not control. |

Healthy controls also exist and must not be confused with bloat:

- RLS/RPC, money, inventory ledger, migration lineage, production-target, auth,
  security, accessibility, and runtime safety gates protect real failure modes.
- The intentional `AGENTS.md` and `engineering.md` constraints mirror passes its
  checker.
- `tasks/todo.md` already has a bounded state model and deletes passed outcomes.
- `tasks/lessons.md`, `tasks/regressions.md`, owning docs, tests, and guards are
  sufficient storage locations when each has one role.
- `scripts/check-doc-staleness.mjs` already blocks snapshot plan trees and task
  history; it should be extended only for deterministic lifecycle checks.

The problem is therefore not “too many rules” in the abstract. The problem is
missing ownership, missing retirement, and gates that preserve text or source shape
without proving an operational outcome.

## Premise challenge

| Premise | Ruling | Reason |
| --- | --- | --- |
| The project lost its self-improving loop. | Accept with correction. | The routing vocabulary remains, but the required closeout event was removed. |
| More memory will solve forgetting. | Reject. | More storage would add another source; the failure is promotion and retirement. |
| The agent architecture should be rebuilt. | Reject. | Existing rules already prohibit a standing team and second authority. A larger framework repeats the cause. |
| All rules and static tests are harmful. | Reject. | Safety and boundary guards are load-bearing. Only wording, implementation-shape, duplicate, or stale gates are candidates. |
| Repository size itself is the primary metric. | Reject. | Immutable migrations and useful tests legitimately grow. Decision latency, proof debt, stale ownership, and recurrence are the useful signals. |
| The project should stop feature work entirely. | Reject as a permanent policy. | A temporary proof-debt recovery gate is warranted; incidents, legal/security work, and already-active delivery continue. |

The highest-leverage reframing is:

> Do not build a system that remembers more. Build a closeout path that either
> encodes one durable fact at its owner or proves there was nothing to retain.

## Goals

1. Make every completed T2/T3 outcome close with one explicit loop result; pilot the
   behavior before deciding whether machine enforcement is needed.
2. Give each durable fact one canonical owner and remove its staging copy in the
   same change.
3. Preserve gates that protect money, authorization, data integrity, deployment,
   accessibility, and irreversible operations.
4. Give verification, test, and agent-tooling cleanup their own evidence, trigger,
   owner choice, and exit before implementation.
5. Return capacity to product operations without creating a permanent governance
   program.

## Non-goals

- No new memory database, vector store, task board, agent-only wiki, governance
  service, recurring mission table, or standing agent team.
- No rewrite of the application, rule tree, test suite, or migration history.
- No blanket deletion target for rules, tests, skills, files, or lines of code.
- No deletion or renaming of applied migrations.
- No change to business, legal, authorization, money, inventory, or UI contracts in
  this ADR.
- No Production, Supabase, Vercel, browser, provider, commit, or push action.
- No scheduled report or notification system; existing task and CI surfaces are
  sufficient.
- No requirement to invent a lesson when a change produced no durable learning.

## Alternatives considered

| Approach | Coverage | Effort | Risk | Result |
| --- | --- | --- | --- | --- |
| A. Restore only the old `Learning: none` sentence | Reminder only | Small | Medium | Restores a prompt but leaves ownership, retirement, and proven drift unresolved. Rejected as incomplete. |
| B. Add the bounded loop, repair proven drift, and pilot two completed outcomes | Minimum complete lifecycle | Small | Low | Reuses current owners and tests the behavior before adding enforcement. Recommended. |
| C. Bundle the loop with verification, test, and tooling cleanup | Broad recovery portfolio | Medium to large | Medium | Gives one roadmap but assumes independent debts share a cause and delays normal product work. Keep as separately approved outcomes, not one decision. |
| D. Build a new self-improvement platform with agents, memory, dashboards, and scheduled audits | New parallel system | XL | High | Creates another authority, more synchronization, and permanent operating cost. Rejected. |

Approach B is the smallest option that fixes the demonstrated lifecycle failure.
Approach C remains the recommended sequence only when each follow-up proves its own
need and receives a separate owner decision.

## Decision

### 1. One lifecycle owner

`docs/agent/rules/workflow.md` owns the closeout lifecycle. Other entrypoints and
commands point to its named sections; they do not duplicate step numbers, lesson
numbers, state definitions, or promotion policy.

`docs/agent/rules/references.md` continues to own the knowledge-location map.
`docs/agent/rules/skills.md` continues to own tool routing. Neither becomes a second
lifecycle definition.

### 2. One bounded closeout declaration

During the pilot, every completed T2/T3 outcome must contain exactly one `Loop:` line
in its owner-visible final task closeout. The final PR description or closeout comment
is the fallback only when no task-conversation surface exists. Use exactly one of
those surfaces, never both. Commits and intermediate updates are not canonical and do
not repeat the line:

```text
Loop: none
```

or:

```text
Loop: observed <sanitized signal> -> encoded at <repo-relative path or stable id> -> deleted <repo-relative path or none>
```

Rules:

1. `Loop: none` means the closeout pass was performed and no reusable signal was
   found. It is not a failure.
2. `observed` names one concrete recurring failure, stable contract, or operational
   fact. It does not contain a task summary.
3. `encoded at` names the one final owner using a repository-relative path or stable
   rule/guard identifier.
4. `deleted` names the staging copy removed in the same diff. `none` is legal only
   when the observation was never staged elsewhere.
5. A transient debate, plan, proof transcript, or one-off command remains in the
   PR/task conversation and uses `Loop: none`.
6. The contract is piloted across two completed T2/T3 outcomes before automation.
7. Every `Loop:` line is sanitized. It contains no secrets, tokens, customer or
   employee data, provider payloads, or sensitive Production identifiers.
8. If either pilot outcome omits the line, record the omission as evidence. Any later
   automation is a separately approved design that must first choose one observable
   canonical surface; this ADR does not preselect a checker or CI event model. If both
   pilots comply, no checker is added.
9. Any future checker could validate syntax and presence, not the truth of the
   judgment. Review validates whether `Loop: none` is credible.

Accepting this ADR does not activate the requirement. It becomes operative only after
Wave 1A is explicitly delegated and merged; the next two completed T2/T3 outcomes are
then the Wave 1B pilot. If Wave 1B passes, the workflow requirement remains active. If
it fails, retention or revision returns to the owner before automation is considered.

T1 remains exempt because a mandatory ceremony for tiny editorial or lockfile-only
work would create noise.

### 3. Knowledge has a promotion path and a deletion rule

| Observation | Temporary home | Final owner | Retirement rule |
| --- | --- | --- | --- |
| Task-local fact, debate, or proof | PR/task conversation | None | Do not persist. |
| Non-mechanical incident insight still being tested | `tasks/lessons.md` | Owning rule/module/ref/spec or a targeted regression | Delete lesson in the promoting diff. |
| Recurring deterministic failure | `tasks/regressions.md` while semantics are still being learned | Behavior test, SQL test, or safety guard; stable rationale in owning doc only when needed | Delete the row when the final enforcement and owner fully express it. |
| Stable architecture or product contract | ADR while proposed, then owning doc/spec/ref after acceptance where applicable | One canonical ADR/doc | Delete superseded staging and duplicate prose. |
| Active delivery outcome | `tasks/todo.md` | Implemented code plus proof | Delete the H2 when Exit passes. |
| External prerequisite | `tasks/todo.md` with `blocked` and a recheck trigger | External owner/action | Delete after the recheck passes; do not leave it in `verify`. |

A regression row may remain beside a guard only when it carries semantic incident
context that the guard and canonical owner do not express. The row must say why it
remains. “Keep rule and guard synchronized” is not a default lifecycle.

### 4. Final outcome closeout is the sole pilot surface

The manual pilot uses the task-first, PR-fallback precedence from Decision 2. The
chosen surface reports:

```text
Outcome: what changed or was proved
Proof: exact checks and current environment
Owner action: none, or one concrete delegated action
Loop: one of the two exact Decision 2 forms
```

Internally, agents still perform the required T2/T3 lenses. Debate transcripts,
intermediate updates, commit bodies, and adapter detail are not alternate closeout
owners. They remain in normal task history and do not create another project artifact.

### Optional follow-up design constraints

The remaining candidates describe safe shapes for separately approved recovery
outcomes. They are not binding decisions in this ADR, and accepting this ADR does not
start them.

### Candidate A: Verification debt stops being a terminal state

The existing tracker states stay unchanged. No new fields or board are introduced.
During recovery, every inherited `verify` outcome receives one of four dispositions:

```text
Exit passes       -> delete the H2
Local proof fails -> doing, with the failing proof as the next action
Scope is unclear  -> triage, with one bounded reproduction question
External proof    -> blocked, with one owner action and recheck trigger
```

No inherited `verify` item may survive the optional recovery outcome merely because
it is old or large. During that finite outcome, one writer owns each lane. After it
closes, visible proof debt informs owner prioritization but does not automatically
block unrelated delivery. Externally blocked credentials, devices, providers, or
Production actions never become a permanent lane lock.

### Candidate B: Tests and guards prove boundaries, not preferred implementations

Every audited gate is classified:

| Class | Default action |
| --- | --- |
| Authorization, money, data integrity, migration lineage, inventory ledger, security, accessibility, destructive action | Keep; strengthen only with boundary evidence. |
| Exact import/runtime prohibition, generated artifact parity, immutable migration contract | Keep a static guard when text or structure is the actual boundary. |
| User or domain behavior | Prefer unit/integration/SQL/browser proof at the owning boundary. |
| Filename, class allowlist, prose wording, source snippet, or historical composition | Replace with behavior proof or delete when no risk remains. |
| Cross-package `readFileSync` test | Move to the owning package, declare the external Turbo input, or replace with an interface-level test. |

Retirement is evidence-driven. A test or guard is deleted only when its protected
failure is impossible, superseded, or covered by a closer and at least equivalent
check. Safety coverage cannot be reduced as part of a cleanup-only rationale.

### Candidate C: Agent startup is incremental

`agent:start` keeps the required skill-bundle verification. For CodeGraph it first
reads `codegraph status -j`:

```text
not initialized                    -> skip; owner decides whether to index
pending changes / worktree mismatch
or reindexRecommended              -> codegraph index . -> status
zero pending changes               -> status only
status unavailable or unparseable  -> fall back to current index -> status behavior
```

The rule wording becomes one contract: run `agent:start` at the start of every
implementation task. A docs-only task does not run it. Re-index after source, SQL, or
generated database-type changes remains unchanged.

This uses CodeGraph's existing JSON status and adds no cache, daemon, or state file.

## Operating model

```text
OWNER OUTCOME
    |
    v
triage -> ready -> doing -> verify -> Exit passes -> delete task
   ^                  |         |
   |                  |         +-> external dependency -> blocked -> recheck
   |                  +-> implementation/proof failure -> doing or triage
   |
   +-------------------------- scope not yet reproducible

At closeout:
observation
  |-- transient ------------------------------> PR/task history only
  |-- prose insight --------------------------> lessons staging
  |-- recurring deterministic failure --------> test/guard (+ temporary regression)
  `-- stable contract ------------------------> canonical doc/ADR

Any promotion deletes its staging copy in the same diff.
```

### Dream-state delta

```text
CURRENT
rules grow + proof waits + lessons duplicate + adapters drift
    |
    v
THIS ADR
one closeout declaration + separately gated recovery + evidence-led retirement
    |
    v
12-MONTH IDEAL
product work is the default; every incident either changes a boundary check or
disappears; current tasks describe only live outcomes; agents reach the right
authority quickly; governance shrinks when the system becomes safer
```

The plan deliberately stops before an autonomous governance service. Automation is
considered only if either of the two pilot outcomes omits the closeout contract or a
later recurring failure identifies the exact manual step that failed.

## Delivery plan

Wave 1 implements the accepted lifecycle decision only after its own explicit owner
delegation. Waves 2-4 are proposed follow-up outcomes and need separate owner
approval. The current dirty working tree is preserved. Writers use isolated worktrees
and serialize edits to authority files.

### Wave 0: Accept the operating contract

**Purpose:** Decide whether this ADR becomes project authority.

**Changes:** This ADR only.

**Exit:** Owner chooses Accept, Accept with named overrides, Revise, or Reject.

**Rollback:** Delete the unaccepted ADR; no runtime state changed.

### Wave 1A: Restore the contract and repair enumerated lifecycle drift

**Primary files:**

- `docs/agent/rules/workflow.md`
- `.claude/commands/verify-gate.md`
- `tasks/lessons.md`
- `tasks/regressions.md`
- `scripts/check-regression-guards.mjs`
- `scripts/list-regression-retire-candidates.mjs`

**Actions:**

1. Add the bounded `Loop:` contract to the workflow and closeout command. Do not add
   CI enforcement during the pilot.
2. Change `verify-gate.md` to named workflow sections; remove lesson item numbers and
   stale step numbers.
3. Promote or delete lesson entries 3, 4, and 36 after re-reading their current
   canonical owners. Renumber only if numbering remains useful; automation must not
   reference ordinals.
4. Resolve the regression-header contradiction. Remove the manually duplicated guard
   inventory or derive/check it from the guard source. Preserve incident prose only
   when it adds semantics beyond enforcement.
5. Repair the missing supplier-invoice test reference against current source.
6. Replace numeric cleanup-policy references and the nonexistent header reference in
   `list-regression-retire-candidates.mjs` with stable semantic wording.
7. Use at least one genuinely duplicate lesson or regression candidate to exercise
   the structured Decision 2 form. If current re-reading disproves every candidate,
   stop and report that the structured branch remains unexercised; do not manufacture
   a lesson to satisfy the plan.

**Exit:**

- The workflow owns the contract and the adapter points to stable named sections.
- At least one real structured promotion encodes and deletes staging in the same
  task-owned diff, or the slice stops with evidence that every candidate was stale.
- The command adapter contains no numeric references to mutable lists or workflow
  steps.
- `tasks/lessons.md` contains only prose-only, still-load-bearing insights.
- Regression cleanup and guard semantics agree, all named paths exist, and the
  checker reports the same guarded rule set it actually enforces.
- `lint:doc-staleness`, `lint:review-tier`, `lint:regression-guards`, and the
  repository completion gates pass.

**Rollback:** Revert Wave 1A as one task-owned governance change. No database or
runtime migration exists.

### Wave 1B: Observe the next two completed outcomes

**Scope:** The next two completed T2/T3 outcomes after Wave 1A lands. No new project
file, checker, template, report, or task field is added for the pilot.

**Actions:**

1. Put exactly one sanitized `Loop:` line in each Decision 2 canonical closeout
   surface.
2. Review whether `Loop: none` is credible and whether any promotion was atomic.
3. If either outcome omits the line, record the omission only. Design of automation is
   a new owner-gated task because it must choose a machine-observable closeout surface.
4. If both comply, stop without adding enforcement.

**Exit:** Both outcomes have a credible closeout result. Across Wave 1A and the two
outcomes, at least one genuine structured promotion has been exercised. If no genuine
signal exists, report the unexercised branch and return for owner review rather than
inventing one.

**Rollback:** Each product outcome and any promotion/deletion remains its own atomic
merge/revert unit. Pilot observations remain ordinary task history; there is no
combined runtime state to roll back.

### Wave 2: Drain the inherited verification backlog (separate owner approval)

**Primary file:** `tasks/todo.md`. Proof may read current source, Preview, Production
catalogs, CI, browser surfaces, devices, or providers according to each outcome's
existing authority and delegation.

**Order:**

1. Local/source/CI proof that requires no external identity.
2. Database catalog and Preview proof that can be grouped by verified target.
3. Authenticated browser, responsive, accessibility, PWA, and device proof.
4. Production/operator/provider proof that requires owner data, credentials, or an
   irreversible action.

**Actions:**

1. Group outcomes by proof environment, not by feature label.
2. Re-read each Exit and Evidence against current source and runtime before running a
   proof; stale evidence is not inherited truth.
3. Apply the four dispositions from Candidate A. Do not add a replacement tracker.
4. Batch owner requests into one concise action list: credential delegation, fixture
   setup, provider configuration, or explicit destructive/Production authority.
5. Where several outcomes share one proof, run it once and cite the same evidence;
   do not create duplicate browser or database sessions.

**Exit:** Every one of the 24 inherited `verify` outcomes is deleted, moved to
`doing`/`triage` with a current failure, or moved to `blocked` with a precise owner
action and recheck trigger. No inherited item remains in `verify` without new proof.

**Rollback:** Tracker changes are reversible in git. Runtime proofs are read-only
unless a separate owner-delegated task explicitly authorizes mutation.

### Wave 3: Slim tests and gates by failure semantics (separate owner approval)

**Scope:** The only initial family under this ADR is
`packages/shared/src/kds/__tests__/auto-kitchen-print-trigger.test.ts` and the app
source it reads across the package boundary. One test family is one slice. Any broader
static-test cleanup requires a new owner-approved task.

**Actions:**

1. Record current command duration and failing-signal quality for the selected family.
2. For each static test, name the historical failure and its true boundary.
3. Keep exact-text checks only where text or imports are the contract.
4. Replace implementation-shape checks with the smallest unit, SQL, component,
   integration, or browser test that fails on the user/domain regression.
5. Repair cross-package Turbo inputs or move the test to the package that owns the
   source.
6. Delete fully covered regression staging rows in the same diff.
7. Consolidate duplicate orchestration inside existing scripts; do not create a new
   meta-runner or framework.

**Exit:** The selected family protects the same or smaller failure blast radius with
fewer implementation-shape assertions; fresh and cached runs agree; full repository
gates stay green; measured duration does not regress without an explicit reason.

**Rollback:** Restore the deleted check if its replacement fails to catch the named
failure. Never weaken a security, authorization, money, inventory, migration, or
accessibility boundary as a performance optimization.

### Wave 4: Make agent startup status-first (separate owner approval)

**Primary files:**

- `scripts/agent-start.mjs`
- `AGENTS.md`
- `docs/agent/rules/skills.md`
- `docs/agent/rules/references.md` only if routing wording changes

**Actions:**

1. Implement status-first CodeGraph refresh with fallback to current safe behavior.
2. Reconcile the fresh-checkout versus every-task wording into Candidate C.
3. Preserve the tracked skill bundle and capability routing in this slice. Dormant
   skill removal, if ever evidenced, is a new T3 proposal rather than Wave 4 work.
4. Do not add another plugin, adapter, cache, daemon, or state file.

**Exit:** With an up-to-date graph, `agent:start` verifies skills and reports status
without invoking `codegraph index .`; pending changes still trigger a successful
index; failure messages state problem, cause, and next action; existing capability
locks still pass.

**Rollback:** Status parsing falls back to the current index path. This wave removes no
skill or capability.

### Independent policy choice: no-AI attribution

The observed mismatch between `engineering.md` and commit history is not a learning-
loop implementation step. In its own owner-gated proposal, either enforce the current
metadata rule at the repository boundary or delete the prose rule. This ADR makes no
choice and grants no implementation authority for it.

### Wave 5: Return to steady-state product delivery

**Operating rules:**

1. Product outcomes remain the unit of work. Governance work exists only when a
   measured failure triggers it.
2. Visible proof debt informs the owner's priority; an external blocker does not
   automatically freeze unrelated work.
3. Every completed T2/T3 outcome has `Outcome`, `Proof`, `Owner action`, and `Loop`.
4. Promotion and staging deletion are one change.
5. A repeated incident is evidence that the previous encoding was incomplete; repair
   the boundary, not the wording.

**Exit:** This is ordinary operation, not a permanent project. Wave 1A and Wave 1B end
after their separate exits pass. Each separately accepted Wave 2-4 outcome ends when
its own Exit passes and its task is deleted.

## Dependencies and execution lanes

| Lane | Work | Dependency | Write boundary |
| --- | --- | --- | --- |
| A | Loop contract and known drift repair | ADR accepted + Wave 1 explicitly delegated | Rules, tasks staging, governance scripts |
| B | Verification backlog proof | Separate owner approval; may start read-only after approval | Runtime evidence; serialize `tasks/todo.md` edits |
| C | Test/guard slimming | Separate owner approval after A establishes retirement semantics | One selected test/guard family per slice |
| D | Status-first agent startup | Separate owner approval; independent of C after A | Agent startup script and aligned rule wording |

Lane A must land first. B, C, and D do not start merely because A lands. After their
separate approvals, read-only proof in B may run alongside design of C or D. Writers
use isolated worktrees. Only one writer at a time edits each authority or task file.
Production or destructive actions never become authorized through parallelization.

## Test and verification plan

### Coverage map

```text
LOOP PILOT
T1 outcome -------------------------> exempt
T2/T3 outcome without Loop ---------> pilot omission recorded
T2/T3 with Loop: none --------------> closeout accepted after review
T2/T3 with structured promotion ----> encoding + deletion checked in the diff
either pilot omits Loop ------------> record evidence; separately design any automation
both pilots include Loop -----------> no checker added

KNOWLEDGE RETIREMENT
lesson still prose-only ------------> remains
lesson encoded in owner ------------> staging deleted in same diff
guard fully owns deterministic rule -> duplicate regression removed
semantic incident context remains --> row states why it remains

VERIFY BACKLOG
Exit passes ------------------------> H2 deleted
proof fails ------------------------> doing/triage
external prerequisite -------------> blocked + recheck
stale evidence ---------------------> re-read, never auto-accepted

STATIC TEST RETIREMENT
true textual boundary -------------> static test retained
behavior boundary -----------------> behavior test replaces shape test
cross-package source read ----------> owning package/input declared/replaced
replacement does not catch failure -> deletion rejected

AGENT START
graph absent -----------------------> safe skip
status current ---------------------> no index
status pending/mismatch ------------> index + status
status JSON failure ----------------> safe fallback index + status
```

### Required checks by wave

| Wave | Targeted proof | Repository proof |
| --- | --- | --- |
| 1A | Structured-promotion diff review; regression-guard and doc-staleness checks | `typecheck`, `lint`, `build`; `verify` when broad guard behavior changes |
| 1B | Manual review of the two final outcome closeouts; no parser or new project artifact | Each underlying outcome's existing gates only |
| 2 | Each task's named Exit evidence on the verified target | Only when code changes are required; read-only proof does not claim implementation completion |
| 3 | Replacement test fails on the named regression before the old static gate is removed; forced fresh Turbo run for cross-package changes | `typecheck`, `lint`, `build`, `test`/`verify` proportional to the family |
| 4 | Agent-start self-tests for all four status paths; existing skill bundle lock stays green | `typecheck`, `lint`, `build`; no bundle change is in scope |

No test-plan file is added outside this ADR. The repository already defines where
plans and active tasks live; another tool-specific artifact would be a second source.

## Error and rescue registry

| Codepath | Failure | Detection | Rescue | Developer/owner sees |
| --- | --- | --- | --- | --- |
| Future loop automation, if separately approved | The chosen machine surface cannot correlate an outcome with its closeout | Design review and representative fixtures after a canonical observable surface is selected | Keep the pilot/manual contract; reject automation that guesses from commits | Exact observable surface or a no-automation decision |
| Promotion | Staging is deleted before the final owner expresses the rule | Task-scoped diff review | Require encoding and deletion in one diff; revert the slice | Named missing owner |
| `Loop: none` | Used habitually to avoid learning work | Review sample and incident recurrence | Reviewer challenges only with concrete evidence; never add a quota | Review comment with the missed signal |
| Regression cleanup | A safety rule is removed because a guard name matches | Named-failure replay and coverage comparison | Keep row/check until equivalent boundary proof exists | Failing targeted test or unresolved T3 finding |
| Static-test replacement | New behavior test misses the historical regression | Mutation/replay of the named failure | Restore old gate, fix replacement, retry | Targeted test failure |
| Verify drain | Proof requires credentials or irreversible action | Exit re-read identifies authority gap | Move to `blocked`; batch one owner action; recheck only after delegation | One concrete action, no repeated prompt |
| Shared dirty tree | A recovery edit overwrites unrelated work | Status snapshot and pre-edit re-read | Isolated worktree or stop on overlap; stage only owned files | Conflicting path and owner needed |
| CodeGraph status | CLI JSON changes or command fails | Non-zero/unparseable output | Fall back to current `index` then `status` behavior | Problem, fallback taken, next action |
| Gate consolidation | Faster command hides a failing sub-gate | Compare direct stage results and full CI | Restore explicit stage; never treat orchestration success as sub-gate success | Failing stage name and output path |

## Failure modes registry

| Failure mode | Prevented or rescued? | Test/proof | Silent? | Severity |
| --- | --- | --- | --- | --- |
| Closeout declaration disappears again | Two-outcome pilot; any automation requires a separately selected observable surface | Pilot record; later design proof only if approved | No | High |
| Lessons and regressions keep growing after encoding | Same-diff deletion rule plus owner review | Wave 1 cleanup and later diff review | No | High |
| `verify` becomes indefinite waiting | Four-disposition recovery rule | Tracker audit after Wave 2 | No | High |
| Safety coverage is deleted during slimming | Named-failure replacement requirement | Targeted failure replay + full gates | No | Critical |
| Static tests continue freezing implementation shape | Classification and one-family-at-a-time retirement | Before/after coverage map | Partly; measured by audit | Medium |
| Agent startup still re-indexes an up-to-date graph | Status-first branch | Agent-start self-test + invocation trace | No | Medium |
| Owner receives repeated fragmented blockers | Proof-environment batching | Wave 2 handoff review | No | Medium |
| A new governance dashboard becomes another authority | Explicit non-goal and existing-surface reuse | Doc-staleness and review | No | High |
| Planning is mistaken for implementation authorization | ADR boundary plus per-slice gates | Review and task handoff | No | Critical |

There is no unrescued, untested, silent critical path in the proposed governance
change. The highest-risk action is deleting a safety gate, so that action is
forbidden without an equivalent failure replay.

## Security and production posture

- This plan creates no endpoint, database object, secret, identity, or Production
  mutation.
- Reviewers and agents remain read-only around Production unless the owner delegates
  the exact action in the current task.
- Auth, RLS, RPC, money, inventory, migration, legal, and provider gates are not
  cleanup targets merely because they are expensive.
- Any separately approved commit-metadata enforcement must not emit author email
  addresses, secrets, or sensitive identifiers in failure summaries.
- Verification backlog proof must redact customer, employee, token, and provider
  payload data.
- Every `Loop:` line follows the same redaction rule and uses repository-relative
  paths or stable identifiers instead of payload data.

## Performance and operational cost

The plan does not set arbitrary file or line quotas. Optional recovery outcomes
measure:

1. Time and failure quality for `agent:start`, targeted checks, and the root gate.
2. Number of active outcomes by state and proof environment.
3. Number of staged lessons/regressions promoted and deleted in the same diff.
4. Recurrence of a named failure after its guard/test was accepted.
5. Net change in implementation-shape static tests for each audited family.

The current `24 verify / 31 total` snapshot is enough evidence to ask the owner about
one finite verification-recovery outcome. No ratio becomes a permanent automatic
trigger. Future recovery requires a fresh count plus product-impact evidence and an
owner priority decision. No dashboard is added; the data already exists in git, CI,
and `tasks/todo.md`.

### Two-outcome pilot scorecard and stop rule

The pilot unit is a completed T2/T3 outcome, not a commit. It ends after two such
outcomes reach their existing Exit.

| Signal | Pass | Stop or revise |
| --- | --- | --- |
| Closeout presence | 2/2 outcomes contain exactly one `Loop:` line. | Either outcome omits it; record evidence and separately decide whether any observable surface can be enforced safely. |
| Signal quality | `Loop: none` is credible, or the observation names one reusable fact. | The line repeats a task summary or invents generic advice. |
| Retirement | Every non-`none` promotion deletes its staging copy in the same diff. | A new duplicate owner or “clean up later” note appears. |
| Structured branch | At least one genuine promotion is exercised across Wave 1A and the two pilot outcomes. | No genuine signal exists; report the branch as unexercised and return for owner review without inventing one. |
| Operating cost | The outcome adds at most the one closeout line unless a real promotion is required. | The pilot creates a template, report, store, field, meeting, or recurring task. |
| Product flow | The loop does not change the outcome's product scope or proof authority. | Governance changes scope, delays an owner-prioritized outcome, or claims new Production authority. |

If both outcomes pass, Wave 1 closes and no additional enforcement is added. If the
same omission later recurs, that recurrence is the evidence for automation. Waves
2-4 use their own baseline and stop rule; none inherits permission from this pilot.

## Developer experience review target

**Primary persona:** A senior developer or coding agent joining an active shared
checkout to deliver one bounded outcome without guessing which instruction, proof,
or environment is current.

**Perspective:** I receive an outcome and first need to know whether this checkout is
safe to use. Today I read an entrypoint, a routing rule, and sometimes an adapter that
repeats older step numbers. `agent:start` can index an already-current 803 MB graph.
I can implement the requested change and pass many gates, yet still leave the outcome
in `verify` because the browser, credential, or Production proof belongs to someone
else. If I discover a reusable lesson, three plausible files can hold it and none
forces the staging copy to disappear. The proposed flow gives me one lifecycle owner,
one actionable startup result, one proof disposition, and one closeout line. I still
do the hard review, but I no longer reconstruct the operating system for every task.

### Developer journey

| Stage | Developer action | Target experience |
| --- | --- | --- |
| 1. Intake | Read owner outcome and non-goals | Scope and authority are explicit. |
| 2. Startup | Run `agent:start` for every implementation task | Current graph returns quickly; stale graph refreshes safely. |
| 3. Locate | Follow `AGENTS.md` -> applicable rule -> owning source | One route, no adapter-owned policy. |
| 4. Execute | Work one lane | Existing same-lane proof debt is visible. |
| 5. Verify | Run targeted and repository gates | Changed lifecycle/startup failures name problem, cause, and next action. |
| 6. Prove | Match the task Exit on the correct environment | Pass, fail, or external blocker is explicit. |
| 7. Learn | Decide whether a durable signal exists | `Loop: none` or one promotion path. |
| 8. Retire | Delete staging and passed task state | Git remains the archive. |
| 9. Handoff | Report four lines | Owner sees outcome, proof, action, and loop only. |

### DX score target

Current times are not measured and will not be invented. Wave 4 records a baseline.

| Dimension | Current assessment | Target after recovery |
| --- | --- | --- |
| Getting started | Fragmented wording; time unknown | First useful source lookup within 2 minutes on an up-to-date checkout |
| Command ergonomics | Correct but repeated work | One `agent:start` command with incremental behavior |
| Error messages | Mixed | Problem + cause + next action for `agent:start` status paths and Wave 1 lifecycle checks; unrelated command output is outside this ADR |
| Documentation | Multiple valid owners with adapter drift | One lifecycle owner and stable named-section links |
| Upgrade path | Manual synchronization | Atomic rule/check/adapter updates with self-tests |
| Development environment | Heavy graph and broad gates | No-op paths are cheap; full safety path remains available |
| Collaboration/findability | Evidence split across stores | One promotion map and four-line handoff |
| Measurement | Counts can be derived but are not reviewed | Trigger-based review using existing git/CI/task data |

The “magical moment” is deliberately boring: the developer runs one command, sees
that the checkout is current without a redundant index, follows one authority path,
and closes the task without leaving another document behind.

## Management cadence

There is no recurring meeting or report artifact. At the end of a delivery wave, the
owner sees:

```text
Outcome: <passed operational result>
Proof: <current source/runtime/CI evidence>
Owner action: <none or one delegated action>
Loop: <one exact Decision 2 form>
```

A recovery proposal may be raised only with evidence:

- a named failure recurs after its accepted guard/test;
- a command adapter references a missing owner or path;
- a gate cannot name the failure it protects;
- measured startup or full-gate time regresses against its recorded baseline;
- two sources claim authority for the same fact.

The owner still decides its priority. If approved, the response is one bounded task
in `tasks/todo.md`, not a new program.

## Consequences

### Positive

- Learning becomes a closeout action rather than an optional memory exercise.
- “No learning” stays cheap, so the signal remains credible.
- Knowledge stores shrink when enforcement or stable ownership improves.
- Proof debt becomes visible as work, failure, or external authority rather than
  indefinite `verify` state.
- Safety gates retain explicit protection while source-shape gates face an evidence
  test.
- Agent startup and owner handoff become shorter without weakening review depth.

### Costs and tradeoffs

- Completed T2/T3 outcomes gain one required closeout line. Automation may be proposed
  only if the two-outcome pilot demonstrates omission; omission does not authorize it.
- A separately approved Wave 2 may temporarily reduce new feature throughput while
  inherited proof is resolved.
- Deleting duplicate prose requires judgment; syntax checks cannot prove semantic
  ownership.
- Replacing static tests can cost more than keeping them. The replacement happens
  only when it improves failure fidelity or package correctness.
- Dormant-skill removal is outside this ADR and would require a new T3 proposal.

## Sequential review synthesis

| Lens | Material challenge | Resolution in this proposal |
| --- | --- | --- |
| Strategy / owner value | The first draft bundled the learning loop with three adjacent cleanup programs and risked a permanent delivery freeze. | The binding decision is now core-only; Waves 2-4 are separately owner-gated, external blockers never freeze unrelated work, and each optional wave has a finite exit. |
| Business analysis | More memory would preserve duplication instead of repairing lifecycle ownership. | Existing stores keep one role each; promotion and staging deletion are atomic. |
| Senior engineering | Acceptance looked like implementation authority; the closeout surface, rollback unit, structured branch, and redaction boundary were ambiguous. | Acceptance records architecture only; Wave 1A/1B have separate delegation and rollback; task-first/PR-fallback is canonical; one genuine structured promotion and sanitized metadata are required. |
| QA / failure analysis | Two `Loop: none` results could pass without testing retirement, while test cleanup could weaken a safety boundary. | Wave 1 must exercise one real structured promotion; Wave 3 is capped at one named KDS family and cannot delete a check without replaying the protected failure. |
| Developer experience | The requirement's activation, first-use command trigger, and error-message denominator were unclear. | The contract activates only after Wave 1A lands; `agent:start` runs for every implementation task; actionable-error targets are limited to its status paths and Wave 1 lifecycle checks. |

No design review is required because the ADR changes no UI surface. The cross-lens
verdict is ready for an owner architecture decision, not implementation. The remaining
choices are acceptance of the core direction, explicit delegation of Wave 1, and any
separate approval for Waves 2-4.

## Acceptance criteria

This ADR can move from Proposed to Accepted when the owner confirms these decisions:

1. Use Approach B: bounded loop, enumerated lifecycle-drift repair, and a two-outcome
   pilot.
2. Require one sanitized `Loop:` in the owner-visible final task closeout for each
   completed T2/T3 outcome, falling back to the PR only when no task surface exists;
   do not preselect an automation surface.
3. Treat lesson/regression/task prose as staging and delete it in the promoting diff.
4. Decide Wave 1 implementation and Waves 2, 3, and 4 separately; accepting the
   architecture starts none of them.

Acceptance records the architecture direction. It does not authorize implementation,
a Production mutation, migration apply, deployment, commit, or push.

## Decision audit trail

| # | Decision | Classification | Rationale | Rejected alternative |
| --- | --- | --- | --- | --- |
| 1 | Reuse current knowledge stores | Mechanical | A second store duplicates authority. | New memory platform |
| 2 | Put lifecycle ownership in `workflow.md` | Mechanical | It already owns review, verification, and task closeout. | Duplicate lifecycle in adapters |
| 3 | Pilot `Loop: none` or structured promotion in the final outcome closeout | Proposed owner choice | A two-outcome pilot tests value before creating enforcement. | Per-commit or multi-surface requirement |
| 4 | Promotion and deletion are atomic | Mechanical | Separating them is the demonstrated source of drift. | Later cleanup promise |
| 5 | Gate verification recovery separately and group it by proof environment | Non-binding candidate | It minimizes repeated credentials without bundling independent work into the core ADR. | Automatic same-lane freeze |
| 6 | Keep safety gates; retire shape gates by evidence in a separate slice | Non-binding candidate | Failure blast radius, not file count, determines value. | Blanket pruning |
| 7 | Propose status-first CodeGraph refresh separately | Non-binding candidate | Existing JSON status provides the needed signal without new state. | Bundled tooling rewrite |
| 8 | Enforce or remove no-AI-attribution policy separately | Independent owner choice | Thirty-five violations show prose is not control, but it is not the loop's root cause. | Bundle into Wave 1 |

## External rationale

- Google SRE postmortem practice favors concrete, owned, measurable preventative
  actions and warns that human-behavior reminders are less reliable than system or
  process changes: <https://sre.google/workbook/postmortem-culture/>.
- GitHub repository rules can enforce commit metadata and expose rule failures to
  developers: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>.
- Self-testing code should detect regressions close to introduction and support safe
  change; this ADR applies that principle while rejecting tests that only preserve an
  incidental source shape: <https://martinfowler.com/bliki/SelfTestingCode.html>.

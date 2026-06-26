# Agentic OS Blueprint — Má Tư

> **⚠️ SNAPSHOT (vision/kế hoạch) — Reconciled-through `0fe2761b` (2026-06-22).** Nhãn `[live]`/`[designed]`/`[future]` bên dưới drift theo thời gian — verify trạng thái thật vào code/git trước khi tin. Quyết định bền: `decisions.md` D036.

Vision + architecture of record for the Má Tư Agentic OS: a mostly-deterministic
operations layer on the existing platform that senses, detects, informs, and —
inside hard, reversible, human-gated limits — acts. Sober and grounded; no hype.

Companion contract: `docs/agent/rules/notifications.md` (the producer / dedup /
routing SSoT). Owner decisions: `docs/plan/decisions.md` → **D036**.

Status legend: **[live]** in prod · **[designed]** agreed, unbuilt · **[future]**
gated.

## 1. One sentence

> A mostly-deterministic nervous system that continuously **senses** shop reality,
> **detects** the few things that threaten margin or compliance, **informs** the
> owner in one channel he actually reads, and — only inside hard, reversible,
> human-gated boundaries — **acts** through the `SECURITY DEFINER` RPCs the staff
> UI already uses.

**Success:** the owner stops manually hunting cash variance, supplier price creep,
stale sessions, food-cost drift — they arrive pre-digested, ranked, with receipts,
before they cost money. The shop runs the same whether he is in the kitchen or
asleep. **Failure (designed against):** an alert firehose he mutes (then misses
the real one); an LLM that misreports a number he trusts; any agent that moves
money / files tax / touches payroll without him. **The single worst outcome is
the owner muting the channel.**

## 2. What "Agentic OS" means here

~95% deterministic SQL + scheduling + good notification design; ~5% a thin,
bounded LLM advisory layer. The intelligence is not in a model — it is in
**noticing the right rows changed in the wrong way** and routing that to a human
who can act in 10 seconds. The owner's gain is **attention saved, not headcount**:
detection he can't do at 2am, pattern memory he doesn't have, synthesis he hates
doing, and a bounded second brain for the genuinely fuzzy calls.

**LLM-pace vs human-pace (honest):** code scaffolds in weeks of LLM-time; **trust
arrives in months of real shop-time.** Each detector needs a shadow period
measured in real service days (cash variance only means something across ~20–30
days; price creep across several GRN cycles) before it may alert, let alone act.
Plan the calendar off shadow wall-clock + owner review, never off coding speed.

## 3. Layered reference architecture (9 layers)

The notification spine (`docs/agent/rules/notifications.md`) is the **Inform**
layer. Every new layer either writes a `notifications` row (a Producer) or calls
an existing RPC (an actuator). Nothing else is invented.

| Layer | Responsibility | Status |
| --- | --- | --- |
| **Sense** | Capture shop reality: POS, KDS, cash, GRN/quality, attendance, print-agent. Camera is "just another sensor", **[future]** | **[live]** |
| **Record** | Durable ground truth (~118 tables). The moat — reason over rows, not vibes | **[live]** |
| **Detect** | Deterministic anomaly + threshold + scheduled aggregation by Vercel cron. No LLM. Each detector is a Producer | **[designed]** (greenfield) |
| **Inform** | Dedup, route, deliver, track reads — the spine | **[live]** foreground popups (server Web Push removed per D046) / **[designed]** Telegram |
| **Reason** | Explain why a flagged thing matters; rank; correlate. LLM read-only, on rows the detector surfaced | **[future]** |
| **Recommend** | Propose an action; never take it. A notification with `action_url` + suggested RPC | **[future]** |
| **Act** | Execute inside hard limits. Tool surface = existing `SECURITY DEFINER` RPCs, allowlist + caps, under an `agent_runner` role | **[future]** |
| **Memory** | What was flagged / decided / suppressed; baselines. `notification_reads` + a thin `agent_decisions` log | **[designed]** |
| **Govern** | Trust boundary, approval gates, kill-switches, audit — wraps every layer | **[designed]** |

**Agent tools = existing RPCs.** We do not build an action API. An allowlist table
maps agent → permitted RPCs → caps; a thin Act runner checks allowlist +
reversibility + cap, calls the RPC under a dedicated role, logs to
`agent_decisions`. The RPCs already enforce RLS, validation, and audit; we
constrain them, not extend them. (Precedent in tree:
`supabase/migrations/20260619062853_security_rpc_cron_runner_hardening.sql`.)

## 4. Agent constellation

The "apps" of the OS. Each is a Producer + (sometimes) an actuator. Autonomy rungs
in §5.

| Agent | Job | Rung | Guardrail | Priority |
| --- | --- | --- | --- | --- |
| **Cash Sentinel** | cash variance, stale sessions, post-paid void | R1 | money-adjacent → alert-only forever | **P0 (wedge)** |
| **Till Anomaly** | void/discount spikes, refund clustering | R1 | pattern → human judgement | **P0** |
| **Price Watch** | supplier price creep, GRN variance | R1→R2 | LLM may draft a supplier message; owner sends | P1 |
| **Stock Guard** | consume-fail, negative stock, expiry, stocktake | R1→R2 | reversible reminders; never auto-adjust stock | P1 |
| **Service Janitor** | stuck KDS tickets, abandoned payments, orphan orders | R2→R3 | idempotent + reversible → the ONLY early auto-act | P1 (pilot) |
| **Compliance Watcher** | HĐĐT reconcile fail, un-issued B2C, deadlines | R1 | tax = hard line; alerts only | P1 |
| **Daily Briefer** | daily/weekly/monthly reports | R1 | LLM narrates; numbers come from SQL | P2 |
| **Shift/HR Nudge** | attendance gaps, leave backlog, consumption drift | R1 | labor = hard line; nudge, never approve | P3 |
| **Owner Copilot** | ad-hoc Q&A over read-only views; suggests RPC deep-links | R1 | strictest LLM boundary; cannot act | P3 |

Eight of nine are alert-or-recommend only. Exactly one (Service Janitor) may
auto-act early, and only because its actions are idempotent, reversible, and
already half-cron'd (`kds-maintenance`, `cleanup_abandoned_payments`).

## 5. Autonomy ladder & governance

| Rung | Name | May do |
| --- | --- | --- |
| **R0** | Shadow / Observe | compute + log to `agent_decisions`. No notification, no action. Every agent starts here |
| **R1** | Inform | write a `notifications` row. **Permanent ceiling for money/tax/labor** |
| **R2** | Recommend | notification carries a prepared action; human taps to execute |
| **R3** | Autonomous-bounded | call a reversible, allowlisted RPC under hard caps, then notify. Idempotent janitorial ops only |

**Promotion gate:** an agent advances one rung only after **N real shop-days** with
precision ≥ bar and zero false auto-acts, AND an explicit owner decision logged in
`docs/plan/decisions.md`. Never automatic.

**Safety model (conservative):**
- **LLM trust boundary:** never a DB connection, never an RPC, never sources a
  number — receives selected rows, returns prose/draft. A wrong number is
  impossible-by-construction.
- **Hard lines — no agent, ever, autonomously:** moves money, files/voids HĐĐT,
  or touches labor (payroll/leave/attendance). R1-alert-forever.
- **Reversibility & audit:** every agent action → `agent_decisions` (append-only).
- **Kill-switches:** per-agent flag + a global OS kill-switch from the owner's
  phone; the underlying staff platform is unaffected.

## 6. Notification / report catalog (summary)

Full enumeration (~107 items) flows through the `notifications.md` contract,
grouped: POS/cash, inventory/low-stock, procurement lifecycle (yêu cầu hàng →
PO → nhập hàng/GRN → supplier price/invoice/returns), finance/HĐĐT, HR, and the
scheduled reports.

**Scheduled reports** (the highest-value addition — turns "alert when wrong" into
"daily confirmation it's right"):
- **Daily Closeout** (02:05 ICT, per branch): revenue vs cash counted vs e-invoice
  issued, voids/discounts, payment mix, top items, food-cost %, low-stock summary.
  The flagship; the natural future LLM-narration host.
- **Weekly** (Mon 09:00 ICT): 7-day revenue/food-cost trend, supplier price drift,
  void/discount trend, attendance summary, slow stock.
- **Monthly:** revenue/COGS/gross-margin per branch, expense breakdown, supplier
  spend, payroll summary, inventory valuation, tax compliance status.

## 7. Maturity roadmap

Read the human-normalized column, not the raw one.

| Stage | Unlock | Advance gate | Effort (raw / human) | Lead agents |
| --- | --- | --- | --- | --- |
| 0 · Spine | spine + cron live (✅) | detectors have somewhere to publish | done / done | — |
| 1 · Detect (shadow) | SQL detectors → `agent_decisions` only | ~20–30 service days clean | days / ~1 month | Cash Sentinel, Till Anomaly |
| 2 · Web-Push live | best detectors R0→R1 | owner acts, doesn't mute | days / ~1 month | Cash Sentinel, Compliance |
| 3 · Telegram + Recommend | Telegram lit; Price/Stock → R2 | recommendations judged correct | 1–2 wk / ~1–2 months | Price Watch, Stock Guard, Briefer |
| 4 · Bounded Act | Service Janitor R3 | zero false auto-acts | 1 wk / ~1 month | Service Janitor |
| 5 · Copilot + tuning | Owner Copilot + threshold tuning | stable, low-noise, trusted | 1–2 wk / ongoing | Owner Copilot, Shift/HR |

> **D046 (2026-06-22):** server Web Push was removed; the "Web-Push live" milestone (Stage 2 / sprint S1) now means the client-side foreground popup channel, not a server push delivery tier. See `decisions.md` D046.

## 8. Sprint plan (notification system = Stages 1–3, packaged)

1-week sprints, ~15 pts. Critical path **S0 → S2 → S3 → S4**; **S1 ∥ S2**.

| Sprint | Goal | Flag |
| --- | --- | --- |
| **S0** | Spine + producer contract + shadow harness + `run_log`; **Cash Sentinel + Till Anomaly shadow-only** (the wedge) | all OFF |
| **S1** | Web-Push tier live (cash variance, negative/low stock) + severity gate + retune cash trigger | `notif.channel.webpush` |
| **S2** | Telegram dispatcher DARK (claim-RPC + ledger + topics, test topic, parity) | `notif.tg.audience=test` |
| **S3** | Telegram LIVE + rate valve + void-after-pay | `notif.tg.audience=real`, `notif.severity.warning` |
| **S4** | **Daily Closeout flagship** | `notif.report.daily` |
| **S5** | Procurement + Inventory + Finance alerts | per-domain |
| **S6** | POS tail + HR + weekly report | `notif.report.weekly` |
| **S7+** | migrations batch + LLM digest (last) | `notif.llm` |

Fastest value: real phone alert ~2 weeks; Daily Closeout ~5 weeks.

## 9. Agent-team delivery model

The "agent team" is the standing model in `docs/agent/rules/team.md` (Orchestrator
+ review lenses + Codex co-runtime) pointed at this backlog — not a new framework.

**Squad (7 role-hats):** Orchestrator (= the Workflow/cron script; sequences,
gates, fan-in), Contract/Architect (owns the seams in `notifications.md`),
Migration/DB (forward `.sql` files → owner PR; applies nothing), Detector/SQL
(detectors + report SQL; shadow-first), Dispatcher/Channel (Telegram dispatcher +
Web Push severity gate), Briefer/Reports+Docs (reports + runbook + LLM digest
last), Verify/QA (adversarial DoD proof, fresh instance). Reviewer = `team.md`
stage-6 Codex pass (not a standing role).

**Coordination:** one sprint = one Workflow run. Every file-writing agent works in
its own git worktree on `main`, commits explicit pathspec, fetch+rebase before
push. Coupling is via the merged contract files only. Migrations are authored a
sprint early and kept off the critical path. Verify can REJECT back to the author
before owner sees a PR. Agent↔agent English; owner-facing Vietnamese.

**Three blocking human (PO) gates:** DoR sign-off (T3 only), migration PR apply to
prod, autonomy-rung promotion.

**Board:** `Backlog → Ready → In-Build[worktree ≤3] → Shadow[N shop-days] →
Awaiting-Merge[owner] → Live-behind-Flag → Done`.

**Honest timeline:** code drafts in ~2–3 weeks of sessions; **DONE ≈ week 10–13** —
~70% of elapsed time is shadow-soak + owner review + serialized prod applies, none
of which coding speed touches. Optimal team size: 2 builders steady, 3 only during
the S5–S6 fan-out.

## 10. The wedge — next concrete move

Build Stage-1 **Cash Sentinel + Till Anomaly as shadow-only detectors** on a new
Vercel cron, writing ONLY to `agent_decisions`. Cash leakage at the till is the
existential, recurring, currently-undetected leak; it is pure deterministic SQL
(zero LLM, zero cost), exercises the whole Detect→Record loop, and shadow mode is
zero blast radius. First three agents: Cash Sentinel, Till Anomaly, Compliance
Watcher.

## 11. What NOT to build

No heavyweight multi-agent framework; no agent for the sake of an agent; no
migration on a sprint's critical path; no parallel file-writes without worktrees;
no second contract file past `notifications.md`; no new action API (use the
existing RPCs); no LLM on the hot path or holding numbers; no auto-reorder /
auto-discount / autonomous HĐĐT / payroll automation; no vector DB / RAG (118
relational tables); no camera until the deterministic OS is trusted and the owner
asks; **never give the LLM a DB connection.**

## Grounding (verified)

Spine: `public.notifications` / `notification_outbox` / `notification_reads`
(server Web Push removed per D046 — delivery is client-side foreground popups).
Scheduling: 4 Vercel cron routes in `apps/web/vercel.json`
(`hddt-reconcile`, `hddt-daily-summary`, `hddt-archive`, `kds-maintenance`). Analytics: `mv_daily_revenue`, `mv_food_cost`,
`mv_grn_price_baseline`, `mv_top_items`, `mv_inventory_stock_current`,
`mv_inventory_value_ranking`. Action surface: existing `SECURITY DEFINER` RPCs
(`cancel_order`, `apply_order_discount`, `cleanup_abandoned_payments`,
`cleanup_kds_tickets_as_system`, `claim_print_job`, `complete_stocktake`,
`approve_leave_request`, …). Confirmed greenfield: no anomaly detector and no
Telegram integration exist yet.

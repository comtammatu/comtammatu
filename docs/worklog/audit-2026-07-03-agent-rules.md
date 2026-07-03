# Audit: Agent Rules Hygiene (docs/agent/rules/* + AGENTS.md)

> Reconciled-through 0a5ee9e20d2d

Date: 2026-07-03
Scope: docs/agent/rules/* (database, engineering, notifications, orchestration, references, skills, team, ui, workflow) + AGENTS.md cross-file consistency.
Method: 10 parallel auditors + skeptic verify pass; every finding mechanically evidence-checked against current code, schema, and scripts. Baseline gates green at audit time (`lint:doc-staleness`, `lint:guard-sync`, `lint:route-matrix`).
Totals: 63 raw findings → **60 confirmed**, 2 owner-decision (unsure), 1 refuted. Findings only — no fixes applied here.

| By file | n | | By category | n |
|---|---|---|---|---|
| skills.md | 11 | | duplicate | 27 |
| notifications.md | 10 | | stale | 11 |
| database.md | 9 | | junk | 10 |
| references.md | 9 | | contradiction | 7 |
| orchestration.md | 6 | | dead-ref | 3 |
| team.md | 5 | | misplaced | 2 |
| engineering.md / ui.md / workflow.md | 3 each | | | |
| AGENTS.md | 1 | | | |

Some sites were independently flagged by two audit lanes (skills.md:34/:371/:389, workflow.md:85, orchestration.md:140, notifications.md:161); each finding is listed, second-lane bullets add the distinct facts.

## Confirmed findings

### database.md (9)

- `database.md:16` — [stale/update] Registry claims `.env.local` points at the prod ref; live env files now point at the local stack (prod env moved to `.env.local.prod-backup`), and the line asserts mutable machine-local state.
- `database.md:20` — [junk/update] Provenance note about deleted dev ref `qsjjqjvtvuqveqmdiyxl` — only reference repo-wide, banned by the no-tombstones MIRROR constraint.
- `database.md:21` — [contradiction/update] "dev-apply allowance is unsatisfiable" (and :58 "no dev/test server exists") contradicts §Preview Branches (D047) in the same file, which authorizes agents to apply migrations to branch refs; guard code allows branch ops.
- `database.md:23` — [stale/delete] Claims regressions.md MCP-APPLY-VS-CLI-PUSH still carries a stale "dev" label; the entry was refreshed 2026-06-16 and no longer does — bullet is now changelog narrative duplicating the registry-wins rule.
- `database.md:43` — [duplicate/keep-investigate] Lines 43/49/50/52 are unmarked near-verbatim copies of MIRROR:constraints items (supabase-js/no-Prisma, Zod, no raw error.message, RPC atomicity); no drift guard covers database.md.
- `database.md:106` — [junk/delete] Dated ledger snapshot "464 rows as of 2026-06-15" — provably stale (prod ledger at 594 rows per the 2026-07-02 rebaseline worklog); nothing references the counts.
- `database.md:108` — [stale/update] "Forward file chain stays the source of truth for provisioning" predates the baseline squash; the install contract is baseline-first (`00000000000000_baseline.sql` + forward chain) per migrations README, ADR 0006, and E2E-BRINGUP-MUST-APPLY-FULL-CHAIN.
- `database.md:170` — [duplicate/delete] Known Failure Patterns restates the `"use client"` barrel rule this file explicitly delegates to engineering.md → Import Boundaries at :44-45.
- `database.md:172` — [misplaced/move] tsconfig `"types": ["node"]` build fact has zero database content; per the Rule Loading map it belongs in engineering.md.

### engineering.md (3)

- `engineering.md:13` — [stale/update] The `corepack pnpm lint` guard enumeration omits `route-matrix`, which the actual lint chain runs; same 11-guard parenthetical also at AGENTS.md:124.
- `engineering.md:63` — [duplicate/merge] "NEVER use the full barrel." restates the MIRROR:constraints rule at :30 within the same file, unmarked.
- `engineering.md:68` — [stale/update] URL Structure block (:65-73) has drifted from the real route tree (`br/[branchId]/runner/` plus top-level inventory/orders/finance/hr/menu/notifications/branches pages missing) and unmarked-duplicates a fact owned by docs/spec/role-route-matrix.md.

### notifications.md (10)

- `notifications.md:30` — [junk/delete] Tombstone about the removed Web Push layer (notifications-push cron, VAPID, push-delivery table/RPC); artifacts confirmed absent from code, nothing load-bearing.
- `notifications.md:58` — [stale/keep-investigate] dedup_key registry omits every live trigger-produced kind (pos.order_new, pos.kds_out_of_stock, workflow.* ×4, grn.requires_review, attendance.checkout_requested), and most of those producers insert with no dedup_key at all — contradicting :41-43's "every producer MUST set dedup_key".
- `notifications.md:61` — [stale/update] `pos.payment_stock_failed` row wrong on both status and dedup_key: no DB trigger emits it (only the MoMo webhook does), and the live dedup_key lacks the mandated `pos.` prefix.
- `notifications.md:68` — [stale/update] `inventory.stock_low` / `inventory.expiry_soon` marked "[designed]" but the detector is live: `scan_inventory_alerts()` exists in the baseline and is pg_cron-scheduled daily.
- `notifications.md:90` — [stale/update] Reserved kind-namespace list omits prefixes already live in prod (workflow.*, attendance.*, grn.*, system.*) — the registry fails its stated all-producers purpose.
- `notifications.md:122` — [junk/update] Changelog narrative inside a rule: "decided 2026-06-22" (already recorded at decisions.md D046) plus a comparison to the removed server push.
- `notifications.md:139` — [dead-ref/update] Present-tense claim that the topic map lives in `inventory_qc_settings.telegram_topic_map` — the column exists in no schema, migration, or generated types.
- `notifications.md:144` — [junk/update] Dangling "#1"/"#6" numbering references a numbered alert list that exists nowhere in the repo.
- `notifications.md:161` — [misplaced/move] "Parallel file-writing agents each work in their own git worktree" is agent-process guidance, off-charter for the producer/dedup/routing contract this file owns.
- `notifications.md:161` — [contradiction/delete] Same sentence, as a blanket mandate, conflicts with engineering.md (same-tree concurrency with atomic staging allowed) and orchestration.md (worktree isolation only when agents mutate the same files).

### orchestration.md (6)

- `orchestration.md:17` — [contradiction/update] Routing Matrix sends the reader to skills.md for model tier, but this file's own Model-Tier Lanes is the concrete chooser and skills.md points back here — circular pointer.
- `orchestration.md:88` — [contradiction/update] Absolute ban "`apply_migration` never appears in an agent script" contradicts database.md's Owner-Delegated Production Apply and the D047 preview-branch flow (agent applies to branch refs).
- `orchestration.md:140` — [duplicate/update] The "promote to the cheapest durable home" ladder restates references.md → Memory Maintenance Rules; the same file says "point there, do not restate" immediately after restating it.
- `orchestration.md:140` — [duplicate/update] Second lane: the ladder is triplicated (orchestration.md, references.md owner, workflow.md step 7); "an enforced rule costs zero context" appears verbatim in three files.
- `orchestration.md:155` — [duplicate/update] The "Learning:" closing-line requirement duplicates workflow.md Verification step 7 (owner per team.md:121) and has already drifted: commit/PR body vs formatted "Learning: none" line in PR/worklog.
- `orchestration.md:162` — [junk/merge] Five of nine Anti-Patterns bullets restate rules stated earlier in the same file; the apply_migration bullet is fact-identical to :88-91.

### references.md (9)

- `references.md:72` — [duplicate/merge] docs/CODEBASE_MAP.md registered twice in the same file with divergent labels (:11 "Codebase map + module index" vs :72 "Current technical status").
- `references.md:89` — [stale/keep-investigate] "canonical, full list of docs/ref/ files" is false: `docs/ref/inventory-taxonomy-v1.md` is absent from the README index and fully orphaned repo-wide (zero references).
- `references.md:102` — [duplicate/merge] Meta-Learning section restates within-file entries (regressions :116, lessons :117, todo :71, skills :8); only the runbook/worklog index rows (:106-107) are unique.
- `references.md:104` — [duplicate/delete] tasks/todo.md listed twice in the same file under different labels (:71 "Active work tracker" vs :104 "Current tasks").
- `references.md:105` — [duplicate/delete] skills.md routing pointer stated three times in the same file (:8, :105, :112).
- `references.md:111` — [duplicate/merge] Memory-store ownership facts are an unmarked cross-file duplicate of AGENTS.md:45-50's instruction-vs-learning-memory list, with drifting phrasing and no mirror guard.
- `references.md:112` — [dead-ref/update] "Agent Workspace config may point to these rules" — no config, tool, adapter, or doc named "Agent Workspace" exists anywhere in the repo.
- `references.md:115` — [duplicate/update] docs/llm-wiki prohibition restated unguarded here (and at :146 and skills.md) on top of its canonical drift-guarded MIRROR:constraints home.
- `references.md:146` — [duplicate/update] Second in-file copy of the llm-wiki prohibition; four copies repo-wide, only the AGENTS.md ↔ engineering.md pair is guarded — only the OKF-specific clause here is unique.

### skills.md (11)

- `skills.md:34` — [duplicate/update] Repository Boundary restates the prod-DB guard wiring and the new-IDE "register in check-guard-sync.mjs, else read-only" rule owned by references.md and database.md; skills.md has zero MIRROR anchors.
- `skills.md:34` — [duplicate/update] Second lane: same adapter rule near-verbatim vs references.md:41-43, whose Agent Entrypoints Per IDE is the declared adapter registry (team.md assigns guard adapters there).
- `skills.md:79` — [contradiction/update] Layer Index assigns per-layer default review tiers (BE/Architecture default T3, Infra T3-if-prod) — a second tier map outside workflow.md, the declared single tier owner, whose T3 triggers include neither architecture nor deploy/CI.
- `skills.md:85` — [contradiction/update] Opens "plugins are per-user Claude state, not repo-pinned" — contradicted ten lines later in the same file, by references.md:45-46, and by repo `.claude/settings.json` → enabledPlugins pinning the same six plugins.
- `skills.md:128` — [junk/delete] "Inventory last re-verified 2026-07-02." — history-recording date; nothing consumes it (doc-staleness check scans only docs/plan + docs/worklog), guaranteed to go stale.
- `skills.md:200` — [duplicate/update] Má Tư UI Skill Routing restates ui.md-owned rules with drift: the rebuild-gate field list adds "regression rules at risk" (absent from ui.md's MUST list), plus the mobile-first/desktop-density philosophy owned by ui.md.
- `skills.md:276` — [junk/merge] GStack Workflow Skills re-enumerates the gstack skill list from Toolset Reproducibility (:108-115) and repeats "nothing is load-bearing on them"; the two hand-maintained lists already disagree in membership.
- `skills.md:371` — [duplicate/update] Model-tier bullet restates the L1/L2/L3 lane assignments owned by orchestration.md → Model-Tier Lanes nearly verbatim before pointing to that table in its last sentence.
- `skills.md:371` — [duplicate/update] Second lane: the bullet mirrors the owner table row-for-row (strongest model for T3 challenge/auth/RLS/money/migrations; fast models for sweeps, evidence collection, log triage, mechanical patches, QA sidecars).
- `skills.md:389` — [duplicate/update] Full description of the Claude T3 accelerators (t3-lens subagent, t3-debate/verify-gate launchers, canonical-transcript note) duplicates the registry entry in references.md → Agent Entrypoints Per IDE.
- `skills.md:389` — [duplicate/update] Second lane: the copy itself says the accelerators are "registered in references.md", making it an unmarked mirror of the registry entry.

### team.md (5)

- `team.md:31` — [junk/delete] The no-restatement meta-rule is stated three full times in the file (:5, :31, :202) plus per-stage echoes (:114, :119) — intra-file duplication of the file's own governing rule.
- `team.md:97` — [stale/update] HRM mission row restates the attendance formula as "công = Σ ca/2", drifted from canonical D027 (missing the per-day min(ca,2) cap and clamp to standard days; 3 shifts in one day yields 1.5 công vs 1.0).
- `team.md:106` — [contradiction/update] Pre-stage-1 goal frame required only "for substantial Codex-led work" — a runtime-conditioned loop step contradicting the same file's Runtime-Neutral Mandate (:43, :47).
- `team.md:161` — [duplicate/update] Handoff Format declares the T3 context list owned by workflow.md → Running A T3 Full Debate, then restates a copy that has already diverged from the owner's list.
- `team.md:196` — [dead-ref/update] Pointer "engineering.md → Git & Commit Conventions" (also at :25) does not match the actual heading "Git And Commit Conventions"; the same file uses the correct name at :120.

### ui.md (3)

- `ui.md:5` — [duplicate/merge] "External design skills never override the Custom Theme contract" is the third statement of the external-tools-not-authority fact (also :42-43; owned by AGENTS.md:47).
- `ui.md:46` — [duplicate/merge] Guardrail restates two same-file rules: visual-token-layer-needs-contract-change (:27) and route-through-surface.tsx (:45).
- `ui.md:54` — [junk/update] "(D038 reverses D032)" is supersession history inside a typography rule; decisions.md owns it, and the contract minus the parenthetical is accurate against runtime (Geist/Geist Mono imports).

### workflow.md (3)

- `workflow.md:85` — [duplicate/update] T2 self-review embeds a copy of the skill-plan template that :23-24 cedes to skills.md → Skill Plan Gate; the copy has drifted (lacks the `skipped = <reason>` field).
- `workflow.md:85` — [duplicate/update] Second lane: same template drift, plus :21-22 repeats skills.md:51's T3-skill-plan sentence near-verbatim while attributing ownership to skills.md.
- `workflow.md:98` — [duplicate/keep-investigate] The exact hard-gate command lives in three places (workflow.md + the guarded AGENTS.md/engineering.md MIRROR pair); team.md declares workflow.md owner of "the exact gate command", so declared ownership and the drift-guarded location disagree.

### AGENTS.md (1)

- `AGENTS.md:137` — [duplicate/update] Workflow Summary restates workflow.md's full T3 trigger list and tier conditions (plus team.md's second-runtime-pass rule) as an unmarked, unguarded copy — already drifted: it omits the "anything that can silently corrupt or leak data" trigger.

## Owner decisions needed (unsure)

- `database.md:112` — [dead-ref/update] "A full ledger re-baseline is owner-gated (see D020)": D020 is the enterprise-accounting exclusion, but ADR 0006 (which D020 delegates the migration chain to) does tie re-baselining to the D020 chain — pointer is indirect/muddy, not dead; repoint to ADR 0006 vs reword vs delete is an owner call.
- `workflow.md:105` — [duplicate/merge] Verification step 5 restates the Review Depth tier-floor facts (:17) within the single file that owns review gates, with no drift; may be intentional checklist self-containment — compressing it to a pointer is a lean-docs judgment call.

---

Refuted by the verify pass: 1 of 63 raw findings.

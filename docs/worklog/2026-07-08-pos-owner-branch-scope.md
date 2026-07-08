# POS Owner Branch Scope T3 Contract

> Reconciled-through `6e693971`

Skill plan: repo rules = engineering + skills + database + workflow + team; external skills = none; runtime tools = CodeGraph + CLI tests; skipped = browser smoke because a safe authenticated POS owner session is not available in this turn.

PM: Scope is owner access to existing POS branch surfaces and actions. Non-goal: widening non-owner branch access.

BA: Owner is the tenant break-glass role for POS. Cashier and branch manager remain pinned to their claimed branch.

Senior Dev: Centralize the POS branch predicate in `isPosBranchInScope`, then replace raw `claims.branch_id !== branchId` rejects in POS server code.

QA/QC: Regression coverage is a static test that fails if POS server code reintroduces raw branch-claim rejects. Run targeted test plus repo hard gates.

Second-runtime fallback: no independent runtime was available in this Codex-only turn; this note records the fallback review stance.

Attestation: BA rules map to `apps/web/app/(protected)/br/[branchId]/pos/_lib/auth.ts` and POS server-action call sites. No schema, RLS, or production DB mutation.

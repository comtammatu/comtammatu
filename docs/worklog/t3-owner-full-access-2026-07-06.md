# T3 Owner Full Access

> Reconciled-through 936311b5f

Skill plan: repo rules = engineering + skills + database/auth + workflow; external skills = supabase for Auth/ACL checklist; runtime tools = CodeGraph + CLI tests; skipped = subagents, because the change is a narrow route/proxy rule and this transcript captures the four required lenses inline.

PM: Owner must be able to open every Má Tư module, including POS/KDS/Runner station surfaces. Acceptance is route/proxy/nav ACL allowing `owner` everywhere while non-owner roles stay unchanged.

BA: The rule is role-level access, not staff impersonation. Owner can enter surfaces across branches; station network gate must not block owner, but branch surface validity still requires an active matching site.

Senior Dev: Put the role rule in `canAccess` and add one proxy predicate so the network gate no longer applies to `owner`. Do not duplicate owner into every role list or widen Server Action role arrays unnecessarily.

QA/QC: Lock the ACL matrix and proxy gate with targeted tests. Then run typecheck, lint with `REVIEW_TIER=T3`, build, and refresh CodeGraph.

Attestation: BA rules map to `packages/shared/src/auth/module-acl.ts` and `apps/web/proxy.ts`; tests map to `packages/shared/src/auth/__tests__/module-acl-matrix.test.ts`, `packages/shared/src/auth/__tests__/scope.test.ts`, and `packages/shared/src/auth/__tests__/network-gate-static.test.ts`. Deferred: no owner impersonation of staff-only Server Actions.

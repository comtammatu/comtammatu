# ADR-0001: Auth Migration Strategy (Blue → Green)

> **Archived 2026-05-23:** Greenfield/blue-green rebuild ADR. Active delivery continues in-place via `tasks/todo.md`; use this only as historical context unless owner reactivates the rebuild program.

> **Status:** PROPOSED
> **Date:** 2026-05-05
> **Decider:** Architect (this ADR) → Owner sign-off (B3 in `docs/plan/10-ROADMAP.md`)
> **Context:** Whole-system rebuild — see `docs/plan/system-rebuild/02-GREEN-BASELINE.md`

---

## Context

Blue is current Supabase project. Green will be a NEW Supabase project. We need every existing user to land in green with:
- preserved `auth.users.id` (UUID) — referenced by `profiles.id`, `staff_permissions.user_id`, `audit_logs.actor_id`, `payments.created_by`, `orders.created_by`, etc.
- preserved email
- preserved `user_metadata` (display_name, etc.)
- preserved identity provider records (`auth.identities`)

Supabase password hashes use a **per-project encryption key** (`auth.GOTRUE_JWT_SECRET` derivative) — they are NOT portable across projects. This is the central constraint.

Audit count: per `audit/queries.sql §9` — let's say N active users + M historical (banned/inactive). Counts inform plan.

---

## Decision

**Bulk import via Supabase Admin API + force-password-reset on first login post-cutover.**

Sequence:

1. **Export from blue** (`pg_dump --schema=auth` filtered):
   - `auth.users` rows (all columns including `encrypted_password` for archive only — won't be reused)
   - `auth.identities` rows
   - `public.profiles` rows
2. **Import into green via Admin API** using service-role key:
   - For each user, call `supabase.auth.admin.createUser({ id: blue_user_id, email, email_confirm: true, user_metadata, app_metadata })` — Admin API supports custom UUID since Supabase Auth v2.143+
   - Skip password (not portable). Do NOT call `password_hash` field — sets blank password.
3. **Backfill `profiles` rows** in green via direct SQL (FK to `auth.users.id` now valid).
4. **Send password-reset email** to every active user via `supabase.auth.admin.generateLink({ type: 'recovery', email })`.
   - User receives email "Cập nhật mật khẩu hệ thống mới" → sets new password → logs in.
5. **Banned/inactive users** (`banned_until > now` or `last_sign_in_at < 6 months ago`) get NO email. They re-onboard manually if needed.

---

## Alternatives Considered

### A. Recreate users from `profiles` (lose `auth.users.id`)
- **Problem**: every FK referencing `auth.users.id` (in `audit_logs`, `payments`, `orders`, `journal_entries`, etc.) becomes orphan. Audit chain broken. Tax compliance risk.
- **Rejected**.

### B. Migrate `GOTRUE_JWT_SECRET` to green (would preserve passwords)
- **Problem**: Supabase does NOT expose this secret to users. Self-hosting required to swap. Out of scope (B4 keeps Supabase managed).
- **Rejected**.

### C. Dual-running auth (federate blue ↔ green during transition)
- **Problem**: complex, requires SSO bridge + JWT verification across projects. 6+ weeks engineering.
- **Rejected** for first cutover. Reconsider if multi-tenant becomes priority.

### D. Magic-link only (no password ever)
- **Problem**: cashier on POS terminal needs password fallback when offline + no email access on shared device.
- **Partially adopt**: enable magic-link as alternative to password (Supabase supports both). Owner-driven preference.

---

## Consequences

### Positive
- Audit chain preserved (UUID stable).
- `profiles.id`, `staff_permissions.user_id`, `audit_logs.actor_id`, etc. work post-cutover with no FK migration.
- Password reset is opt-in user task, not blocker for cutover.
- Banned users naturally filtered out (don't get reset email).

### Negative
- Every active user MUST reset password before next login. Cashier may be locked out at shift start if email not checked.
- Email deliverability becomes critical — Supabase project email config (SMTP) must be verified pre-cutover.
- Identity provider rows (`auth.identities`) need careful import — one row per (user, provider) combination.

### Mitigations

| Risk | Mitigation |
|---|---|
| Cashier locked out | Owner sends pre-cutover communication: "Hệ thống mới — kiểm tra email trước ca làm". Manager-mode override password (set by branch_manager) for emergency login. |
| Email SMTP not configured in green | Pre-cutover: configure SMTP, send test email, verify delivery to known mailboxes. |
| Magic-link rate-limit hit (Supabase default 30 emails/hour) | Stagger reset emails by branch, batch over 6h pre-cutover. |
| Identity provider drift (Google OAuth, etc.) | Re-register OAuth client_id with new green project URL; user re-auths once. |

---

## Verification

Before cutover:
1. **Rehearsal #1** (1 week pre): export 10 random users from blue dev project, import into green dev, send reset emails, verify login.
2. **Rehearsal #2** (3 days pre): full export of blue dev, full import to green dev, verify count parity (`SELECT COUNT(*) FROM auth.users`).
3. **Cutover day**: run import script → verify count → trigger reset emails for active users only → smoke test 3 personas (owner, branch_manager, cashier) login + RBAC enforcement.

Post-cutover:
- Monitor `auth.users.last_sign_in_at` first 7 days. Users with no sign-in by day 7 → contact branch_manager.
- Audit any FK-broken row (should be 0).

---

## Open Items

- **OAuth providers**: list providers in use (`auth/queries.sql §9` returns this). Decide per provider: re-register vs disable.
- **MFA enrollments**: Supabase MFA factor records — included in `auth.mfa_factors` table; export+import same pattern as `auth.identities`.
- **Session reset**: all active sessions (`auth.sessions`) invalidated by green-project switch. Users see login screen on first hit. Acceptable.

---

## References

- Supabase Admin API docs (`auth.admin.createUser`)
- `docs/plan/system-rebuild/03-DATA-MIGRATION-POLICY.md` §"Migration Rules" — preserve primary IDs
- `docs/plan/system-rebuild/04-CUTOVER-QA-RUNBOOK.md` §"Verification Layers" → Auth/RLS gate
- Companion ADRs: 0002 (DB provider), 0003 (rollback)

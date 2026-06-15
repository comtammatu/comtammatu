# HRM Đợt 2 (a) — one-step employee create (D026)

T3 contract for removing the "paste Profile UUID" step from `/hr` employee
creation. Replaces the 2-step flow (create login in `/admin/staff` → copy UUID →
paste in `/hr`) with a single form that creates the login account + profile +
employee record in one submit.

## Skill plan

Skill plan: repo rules = engineering + database + ui + workflow; external skills = none
(single-topic, internal HR surface); runtime tools = none (no dev DB — migration-free,
prod SELECT-only); skipped = browser/db-apply (env points at prod).

## Ground truth (verified in code + prod)

- `/admin/staff` `createStaff` (admin/staff/actions.ts:91): `serviceClient.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { tenant_id, branch_id, role, full_name } })`. Login id = real email.
- `handle_new_user()` trigger (baseline.sql:11969) fires on `auth.users` INSERT, reads `app_metadata.{tenant_id,branch_id,role,full_name}`, resolves `position_id` via `_auth_v2_position_id_from_role`, inserts `profiles`. It does **not** write `phone`.
- `createStaff` parses `phone` but never persists it (destructures without `phone`); phone is only set later via `updateStaff` → `admin_update_profile`. So phone is dropped on create on BOTH surfaces today — this slice fixes it for the HR path.
- `employees`: `UNIQUE(profile_id, tenant_id)`, `UNIQUE(employee_code, tenant_id)`, FK `profile_id → profiles ON DELETE CASCADE`, has `is_active`, **no `end_date`**, **no `phone`** (phone on `profiles`).
- `positionOptions` (admin/staff/page.tsx:85) = positions mapped via `staffRoleFromPositionCode(code)` → `{ value: bucket, label: label_vi }`, deduped, excluding owner/unassigned. The action receives `role` (StaffRole bucket).

## Four perspectives

**PM** — Scope: the highest-friction Đợt-2 piece is "bỏ dán UUID". MVP = one form
that onboards a NEW hire end to end (account + profile + employee). Acceptance:
owner fills name/email/password/phone/role/branch/code/start/checklist and gets a
working login + employee row in one submit; no UUID anywhere in the UI.
Out of scope (follow-up PRs): `updateEmployee`, deactivate-with-`end_date` (needs a
migration to add `employees.end_date`), leave 2-way notify (c), `/admin/staff` rename
(d), and merging the two surfaces. Linking a *pre-existing* `/admin/staff` account to
an employee record is dropped — the one-step flow is the single onboarding path.

**BA** — Rules: operational roles (cashier/waiter/chef/branch_manager) require a
branch; that branch must be `branch_kind='branch'`; `owner` may not be created here;
email must be unique; checklist template (if chosen) must be Global or match the
selected branch. Edge cases: duplicate email → "Email đã được sử dụng"; duplicate
`employee_code` → "Mã nhân viên đã tồn tại"; the account is created via the Auth API
*before* the employee row, so a failure after auth-create must not leave an orphan
login.

**Senior Dev (architecture)** — The auth user is created by an HTTP Auth Admin call,
which cannot share a Postgres transaction with the `employees` INSERT, so true DB
atomicity is impossible across that boundary. Use a **saga**: create auth user →
update phone → insert employee; on any post-auth-create failure call
`auth.admin.deleteUser(userId)` (cascades to `profiles` via FK) to roll back the
orphan. New action `createEmployeeAccount` in hr/actions.ts (owner-only, service
client), mirroring `createStaff`'s validation verbatim to avoid drift. Remove the now
dead `createEmployee` + `loadEmployeeProfileBranch` + old `employeeSchema` (no other
caller). Form gains `branches` + `positionOptions` (built in hr-client from the
already-loaded `positionDefaults`). No migration, no `db:types`. Affected files:
hr/actions.ts, hr/employee-form-dialog.tsx, hr/hr-client.tsx.
Known tech debt: the auth-create core is duplicated from `createStaff`; a shared
helper is a later refactor (broader blast radius, deferred).

**QA/Security** — Regression surface: must not change `/admin/staff` createStaff, the
`handle_new_user` trigger, JWT claims, or RLS. Cross-boundary checks: (1) action role
bucket ↔ `app_metadata.role` ↔ trigger position resolution; (2) form field
`branch_id` ↔ action validation ↔ `employees`/`profiles` branch. Verify the saga
deletes the orphan on a forced employee-insert failure (duplicate code). Hard gate:
typecheck/lint/build. Owner runtime-verifies the create + login on a real env (dev
points at prod, so no agent runtime test).

## Attestation

- Test-plan items covered: validation rules + saga rollback path are in code;
  runtime create/login verification deferred to owner (no non-prod env).
- BA rules → implementing site: ops-role-needs-branch + branch_kind + owner-block +
  email-dup + code-dup + checklist-branch + orphan-saga all in `createEmployeeAccount`.
- Out-of-scope gaps: updateEmployee, deactivate+end_date, leave notify, /admin/staff
  rename, link-existing-account — tracked under todo "Agent-doable now" / Đợt 2.

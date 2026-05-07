# ADR-0011: Multi-Factor Authentication And Recovery

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-07)
Decision owner: Owner + Tech Lead

## Context

Several W1 RPCs gate sensitive actions on a fresh second-factor token:

- `reopen_period` (period close reversal) — `finance:period_reopen` permission + 2FA OTP.
- `reopen_payroll_period` — `payroll:period_reopen` permission + 2FA OTP.
- Tenant legal profile change — `tenant:legal_profile_change` + 2FA recommended.
- Provider secret rotation — touch `private.provider_secrets`, recommended 2FA.

The state machines in `docs/architecture/state-machines/period-close.md` §reopen and `docs/architecture/state-machines/payroll.md` §reopen reference 2FA but do not specify enrolment, recovery, or session-binding semantics. Without an explicit policy, owners cannot reliably perform these actions and tech leads will improvise.

comtammatu currently has zero references to MFA-AAL2 in plan documentation despite having `accounting:period_reopen` and `payroll_approve` permission keys. Codex adversarial review (2026-05-07) flagged this as CRITICAL.

## Decision

Adopt **Supabase TOTP MFA** as the second factor for owner and super_manager accounts. MFA is **mandatory** for owner-only RPCs (`reopen_period`, `reopen_payroll_period`, `tenant:legal_profile_change`, provider secret rotation). MFA is **recommended** for super_manager and **optional** for branch_manager and below. Phone/SMS OTP is explicitly NOT used (SIM-swap risk).

## Enrolment Flow

1. Owner logs in with password (Supabase Auth).
2. Back-office web `/admin/security/mfa` route calls `supabase.auth.mfa.enroll({ factorType: 'totp' })`.
3. UI displays QR code; owner scans with an authenticator app (Google Authenticator, 1Password, Authy, etc.).
4. Owner enters the first 6-digit code; UI calls `supabase.auth.mfa.challengeAndVerify({ factorId, code })`.
5. On success, `aal` (Authentication Assurance Level) flips to `aal2` for the current session, and `auth.mfa.factors` records the verified factor.
6. UI generates 8 single-use **backup codes** server-side (cryptographically random, hash stored in `private.user_backup_codes` per Supabase recommendation), shown to the owner exactly once. Owner saves them offline.

## Step-Up Flow For Sensitive RPCs

The 2FA-gated RPCs require the caller's session to be at `aal2` and the AAL to be **fresh** (verified within the last 5 minutes).

```sql
create or replace function public.require_recent_aal2()
returns void language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_aal text := auth.jwt() ->> 'aal';
  v_amr jsonb := auth.jwt() -> 'amr';
  v_last_totp_at timestamptz;
begin
  if v_aal is distinct from 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  -- amr is an array of { method, timestamp } entries; pick the latest 'totp' entry.
  select max((entry ->> 'timestamp')::timestamptz)
    into v_last_totp_at
  from jsonb_array_elements(v_amr) as entry
  where entry ->> 'method' = 'totp';

  if v_last_totp_at is null or v_last_totp_at < now() - interval '5 minutes' then
    raise exception 'mfa_step_up_required' using errcode = '42501';
  end if;
end;
$$;
```

Each gated RPC calls `perform require_recent_aal2();` as the first statement. Web client maps `mfa_step_up_required` to a step-up UI that prompts for a fresh TOTP code and calls `supabase.auth.mfa.challengeAndVerify({ factorId, code })`, then retries the RPC.

## Recovery Flow

If the owner loses the TOTP device:

1. Owner uses a single-use backup code at the MFA prompt. Each backup code is consumed (marked `used_at` in `private.user_backup_codes`).
2. After successful step-up, owner must immediately re-enrol a new TOTP factor and regenerate backup codes; the old factor is retired.
3. If all backup codes are exhausted, the recovery path requires:
   - Tech Lead opens a recovery ticket.
   - Owner verifies identity via the same channel used for sign-off (per CONTRIBUTING.md, GPG-signed email).
   - Tech Lead executes a one-shot `admin_reset_owner_mfa(owner_user_id, ticket_ref)` SECURITY DEFINER RPC. The RPC requires Tech Lead's own `aal2` session, writes an `audit_logs` row of severity `critical`, and resets the owner's MFA factors. This RPC is the only emergency path; it is gated by `tenant:provision` permission which is not granted to any operating role.

## Forbidden

- **SMS / phone OTP** — SIM-swap risk in Vietnam (per regression rule below).
- **Email OTP** — same email could be compromised that gates everything.
- **Disabling MFA on owner accounts** — even temporarily — without going through the recovery RPC (which audits and notifies).
- **Reusing backup codes**.
- **Storing TOTP secrets in `auth.users.raw_user_meta_data`** or any `public` table — Supabase manages factors in `auth.mfa_factors`.

## Acceptance Gates

- `/admin/security/mfa` route ships in W2 alongside auth.
- All four sensitive RPCs (`reopen_period`, `reopen_payroll_period`, `tenant_legal_profile_change`, provider secret rotation RPCs) call `require_recent_aal2()`.
- Backup-code generation, hash storage, and consumption are tested.
- Owner self-recovery via backup code is tested.
- `admin_reset_owner_mfa` RPC exists, is gated by `tenant:provision`, and writes critical audit row.
- Web client maps `mfa_required` and `mfa_step_up_required` to step-up UI.
- Regression rule `MFA-RECENT-AAL2-FOR-SENSITIVE-RPCS` lands in `tasks/regressions.md` (added in same PR).
- Regression rule `NO-SMS-OR-EMAIL-OTP-AS-SECOND-FACTOR` lands in `tasks/regressions.md` (added in same PR).

## Consequences

- Owner must complete MFA enrolment before signing cutover policy. The cutover rehearsal covers an MFA-gated reopen end-to-end.
- The recovery RPC is a high-trust escape hatch; access is documented in the operational runbook.
- Tech Lead's own account also enrols MFA before being able to execute `admin_reset_owner_mfa`.
- Adding the four MFA-gated RPCs to existing comtammatu code (currently `complete_payment_*`, `confirm_*`, `transition_tax_invoice_state`) requires audit during W4.

## Cross-References

- `docs/architecture/auth-and-permissions.md` §11 (Emergency-Mode Permission Elevation — distinct from MFA).
- `docs/architecture/state-machines/period-close.md` §Reopen Flow.
- `docs/architecture/state-machines/payroll.md` Transitions Per Period (reopen rows).
- `tasks/regressions.md`: `MFA-RECENT-AAL2-FOR-SENSITIVE-RPCS`, `NO-SMS-OR-EMAIL-OTP-AS-SECOND-FACTOR`.
- ADR-0012: Tenant configuration separation uses `require_recent_aal2()` for `set_provider_secret` and `update_tenant_legal_profile`.
- [Supabase MFA docs](https://supabase.com/docs/guides/auth/auth-mfa).

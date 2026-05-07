# ADR-0012: Tenant Configuration Separation Across `.env`, `public.tenant_settings`, And `private.provider_secrets`

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-07)
Decision owner: Owner + Tech Lead

## Context

Cơm Tấm Má Tư rebuild is multi-tenant (HKD pilot first, CTCP-ready). Several pieces of operational configuration vary per tenant and change after the app is deployed:

- Legal identity: tax code (MST), registered name and address, tax/invoice regime.
- Payment provider credentials: VietQR bank account, MoMo `partner_code` / `access_key` / `secret_key`, VNPay/ZaloPay merchant info when added.
- E-invoice provider credentials: MISA HĐĐT account, API key, signing key.
- Webhook signing secrets per partner.
- Branding and operational toggles: receipt footer, default tax rate, business hours, logo URL, contact email.

If any of these live in `.env`, every change requires a developer to edit the file and redeploy the runtime. For a tenant-facing pilot that already needs HKD compliance from day one (`HDDT-REGIME-CLASSIFIED`), this is unworkable: the owner cannot rotate a leaked MoMo secret, update an MST after a legal-form change, or onboard a second tenant without engineering involvement.

Codex adversarial review (2026-05-07) flagged comtammatu's current `system_settings.einvoice_provider` pattern as CRITICAL — mixes config + secret in same table, RLS reading `system_settings` would leak provider API key.

Three regression rules already define the policy in fragments:

- `ENV-NO-PER-TENANT-SECRETS` (per-tenant credentials must not live in `.env`).
- `ENV-NO-PER-BRANCH-SECRETS` (per-branch/device credentials must not live in `.env`).
- `PROVIDER-CREDENTIAL-ROTATION` (rotation and revocation are required, not optional).

## Decision

Adopt a **three-tier configuration boundary**. Each kind of configuration lives in exactly one tier, and each tier has a single owner and a single update path:

| Tier | Where it lives | Who writes it | Who rotates it | When it changes |
|---|---|---|---|---|
| 1. Deployment | `.env` (per Supabase project / per Next.js deployment) | Tech Lead during deploy provisioning | Tech Lead on infrastructure rotation | Rare; triggers redeploy |
| 2. Tenant non-secret config | `public.tenant_settings` (JSONB key/value) and `public.provider_settings` (per-tenant non-secret provider config) | Tenant owner / super_manager via `/admin/settings` UI through SECURITY DEFINER RPC | Same | Anytime; effective immediately, no redeploy |
| 3. Tenant secrets | `private.provider_secrets` (envelope-encrypted, AES-256-GCM, KMS-key reference in `.env`) | Tenant owner via `/admin/settings/integrations/{provider}` UI through SECURITY DEFINER RPC, with audit row + MFA step-up | Same; rotation appends a new row, old row keeps `revoked_at` for grace window | Anytime; effective immediately, no redeploy |

`.env` carries deployment infrastructure only:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
- Provider mode flags (`PAYMENT_PROVIDER_MODE`, `EINVOICE_PROVIDER_MODE`, `RATE_LIMIT_PROVIDER_MODE`) that select adapter implementations, not credentials.
- Rate-limit backing service URL/token (per-deployment, shared across tenants in that Supabase project).
- A `MATU_KMS_KEY_REF` reference to the envelope-encryption key id used to encrypt rows in `private.provider_secrets`. The key material is held by the deployment's KMS provider; `.env` only carries the reference identifier.
- `DEV_*`-prefixed sandbox slots that are empty in committed `.env.example`. They exist for a developer's own test tenant during local provider sandbox development and must be unset in staging or production.

Per-tenant or per-branch values are **never** in `.env`. Adding a `VIETQR_BANK_CODE`, `MOMO_*`, `EINVOICE_API_KEY`, `TENANT_TAX_CODE`, `BRANCH_HUB_TOKEN`, or any partner-keyed variable to `.env.example` is a regression of `ENV-NO-PER-TENANT-SECRETS` or `ENV-NO-PER-BRANCH-SECRETS`, even with a placeholder value, because doing so trains contributors to put real values there.

## Migration From Existing State

comtammatu currently has `system_settings` table with mixed config + secret patterns (per Codex review):

- `system_settings.einvoice_provider` — provider mode, OK to keep
- `system_settings.PAYMENT_ENABLE_*` flags — non-secret toggles, OK to keep
- Bank account info on QR code — public, OK to keep
- `MOMO_SECRET_KEY`, `VIETQR_API_KEY` — currently in env vars, must MIGRATE to `private.provider_secrets`

W4 migration plan:
1. Create `tenant_settings`, `provider_settings`, `private.provider_secrets` tables (W4 Day 1).
2. Migrate non-secret `system_settings` keys → `tenant_settings` (W4 Day 2).
3. Migrate provider mode flags → `provider_settings` (W4 Day 2).
4. Migrate provider secrets from env → `private.provider_secrets` with envelope encryption (W4 Day 3).
5. Remove `system_settings.MOMO_*` / `system_settings.einvoice_*` columns (W4 Day 4).
6. Update integrations code to read from new tables (W4 Day 5).

## Tables

### `public.tenant_settings`

Non-secret tenant-scoped key/value configuration. Owner / super_manager writes via RPC. RLS reads are tenant-scoped.

Examples of keys:

- `pos.receipt_footer` — Vietnamese text printed at the bottom of the receipt.
- `pos.default_tax_rate` — number, 0.10 for 10% VAT.
- `branding.logo_url` — Supabase Storage path.
- `notifications.contact_email` — operator contact for incident notifications.
- `emergency.max_concurrent_sessions` — integer override of the default 1 from ADR-0008.

DDL lives in `docs/architecture/schema-p0-ddl.md` §"Tenant Configuration" (W0' deliverable).

### `public.provider_settings`

Non-secret per-tenant provider configuration: provider mode override (rare; usually the deployment-level flag wins), provider account display name, provider connection status (last successful call timestamp). This is the row a tenant admin sees in `/admin/settings/integrations/{provider}` when they want to know "is the MoMo integration set up for my tenant?" without exposing the secret itself.

DDL lives in `docs/architecture/schema-p0-ddl.md` §"Tenant Configuration" (W0' deliverable).

### `private.provider_secrets`

Encrypted credential storage per `(tenant_id, provider)`. Envelope encryption: AES-256-GCM, the data key is generated per row, the data key is sealed with the KMS key referenced by `MATU_KMS_KEY_REF`. The row stores `ciphertext`, `nonce`, `envelope_alg`, `envelope_kid`, `is_active`, `revoked_at`, `rotated_at`, `rotated_by`. There is no row-level decryption helper exposed via PostgREST; the only path to plaintext is a server-only Node helper in `packages/integrations` that runs in the Next.js Server Action runtime or a `jobs/*` worker.

DDL lives in `docs/architecture/schema-p0-ddl.md` §"Tenant Configuration" (W0' deliverable).

## RPC Surface

Three SECURITY DEFINER RPCs handle the write paths. Each enforces tenant scope, permission scope, and (for sensitive surfaces) MFA freshness per ADR-0011.

- `update_tenant_legal_profile(p_payload jsonb)` — appends a new `tenant_legal_profiles` row with effective range starting now, closing the previous row. Requires `tenant:legal_profile_change` and `require_recent_aal2()`.
- `set_tenant_setting(p_key text, p_value jsonb)` — upserts into `public.tenant_settings`. Requires `settings:tenant_manage`.
- `set_provider_secret(p_provider text, p_ciphertext bytea, p_nonce bytea, p_sealed_dek bytea, p_envelope_kid text)` — appends a new active row in `private.provider_secrets`, marks the previous active row as `revoked_at = now()` and sets `grace_until = now() + interval` (grace window kept for in-flight webhook signature validation). Requires `settings:provider_configure` and `require_recent_aal2()`. Writes one `audit_logs` row with `redaction_class='contains_legal'`. The same RPC also updates `provider_settings.status`, `last_rotated_at`, and `updated_by` so the Settings UI status pill flips immediately.

Read paths:

- `get_tenant_setting(p_key text)` — RLS-scoped SELECT for tenant members.
- `get_provider_settings(p_provider text)` — non-secret status for the integrations page.
- `private.get_provider_secret_decrypted(p_tenant_id uuid, p_provider text, p_request_id text)` — server-only Node helper; not a PostgREST-exposed RPC. Loads the active ciphertext + the previously-active row inside the grace window, decrypts via the KMS-sealed data key, returns plaintext to the caller. Caller must redact via `redactCredentials()` before logging.

Permission keys this ADR uses:

- `settings:tenant_manage` — **new** — write `tenant_settings` keys.
- `settings:provider_configure` — already exists in `module-acl.ts`; this ADR makes it the single permission for both `provider_settings` updates and `set_provider_secret` rotation.
- `tenant:legal_profile_change` — already exists; ADR-0011 binds the MFA freshness check to it; this ADR is the table-and-RPC contract that uses it.

Default role grants:

- `owner` — all three (inherits via `ROLE_DEFAULT_PERMISSIONS.owner = PERMISSION_KEYS`).
- `super_manager` — inherits `settings:tenant_manage`, `settings:provider_configure`, and `tenant:legal_profile_change` via the existing filter (`PERMISSION_KEYS` minus `tenant:provision`, `tenant:billing`, `audit:purge`). Operators who want to restrict super_manager from rotating provider secrets must remove `settings:provider_configure` from the super_manager default in `module-acl.ts` in a follow-up; this ADR does not change that default.
- Other roles — none of the three by default.

Adding any of these keys to `packages/shared/src/auth/module-acl.ts` triggers `ACL-SINGLE-SOURCE` and the Dart codegen via `pnpm acl:build`.

## UI Surface

Routes under `/admin/settings/*` in `apps/web` (Next.js App Router):

| Route | Owner job | Permission |
|---|---|---|
| `/admin/settings` | Index page; lists subpages with status pills (configured / not configured / needs attention). | `settings:tenant_manage` or `settings:provider_configure` to enter |
| `/admin/settings/legal` | Edit MST, registered name, address, tax/invoice regime. Submit creates a new `tenant_legal_profiles` row. | `tenant:legal_profile_change` + MFA step-up |
| `/admin/settings/integrations` | Per-provider list with masked status (e.g., "MoMo: configured, last rotated 3 days ago"). Never displays the secret. | `settings:provider_configure` |
| `/admin/settings/integrations/[provider]` | Form to set or rotate credentials. Inputs are write-only; reading the form does not return the existing secret. After save, shows a success toast and the provider's "Test connection" action. | `settings:provider_configure` + MFA step-up |
| `/admin/settings/branding` | Receipt footer, logo, default tax rate, business hours. Backed by `tenant_settings` keys. | `settings:tenant_manage` |

The legal page and the per-provider page are **the only places** where these values can be edited. There is no admin escape hatch via direct PostgREST writes; RLS for `public.tenant_legal_profiles`, `public.tenant_settings`, `public.provider_settings`, and (always) `private.provider_secrets` denies direct INSERT/UPDATE from `authenticated`.

UI primitives come from `apps/web/app/components/surface.tsx` (`PageSurface`, `SectionCard`, `ToolbarRow`, `EmptyState`) per `APP-SURFACE-ADAPTER-FIRST` (W0' deliverable).

Vietnamese operator copy lives in the shared dictionary per `COPY-LABEL-SOURCE-OF-TRUTH`. Validation errors map to safe Vietnamese strings; raw Postgres / Supabase error text never reaches the operator (`RAW-ERRORS-NOT-CLIENTS`, `SAFE-VIETNAMESE-ERRORS`).

## Encryption Model

Envelope encryption at the row level:

```
plaintext credential
  -> AES-256-GCM with a per-row data key (generated server-side)
  -> ciphertext + nonce stored in private.provider_secrets
  -> data key sealed with the KMS key referenced by MATU_KMS_KEY_REF
  -> sealed data key stored alongside ciphertext (or in a sibling column)
```

KMS provider for production: Supabase pgsodium or an external KMS (AWS KMS / GCP KMS) accessed by the Node helper in `packages/integrations`. The W1 baseline can use pgsodium for symmetric envelope encryption since it is already available inside Postgres; switching providers later is a key-rotation exercise, not a schema change.

Rotation:

1. Tenant owner enters new credentials in `/admin/settings/integrations/{provider}`.
2. UI calls `set_provider_secret(...)` Server Action.
3. RPC sets `revoked_at = now()` on the existing active row, inserts a new active row, and records both events to `audit_logs` (redacted).
4. For a configurable grace window (default 24 hours), webhook signature verification accepts either the active or the recently-revoked row's secret. Beyond the window, only the active row is consulted.
5. A pg_cron job removes physically `revoked_at IS NOT NULL AND revoked_at < now() - tenant_grace_interval` rows.

Rotation never deletes the audit trail; it only deletes the encrypted material.

## Consequences

**Wins**

- Tenant owners change MST, MoMo merchant, MISA account, receipt footer, default tax rate without any developer involvement and without a redeploy.
- Adding a second tenant is a back-office workflow, not a deployment workflow. The CTCP cutover (when the same tenant transitions HKD → CTCP) lands as a `tenant_legal_profiles` row addition and a few `tenant_settings` key changes.
- A leaked MoMo secret can be rotated by the owner in minutes; the existing webhook keeps validating during the grace window.
- `.env` stays small enough to review on every change. New deployment-level secrets stand out because the file does not get progressively cluttered with per-tenant data.

**Costs**

- W1 baseline must ship the three tables (`tenant_settings`, `provider_settings`, `private.provider_secrets`) and the four RPCs (`update_tenant_legal_profile`, `set_tenant_setting`, `set_provider_secret`, `get_provider_settings`) before any provider integration goes beyond mock mode.
- Server-side decryption helper in `packages/integrations` must redact via `redactCredentials()` before any logging or audit write. A bug here leaks credentials. Mitigation: contract test in `packages/security` that round-trips a fixture through the helper and asserts the redacted output never contains the plaintext value.
- KMS key rotation becomes a maintenance task. Default cadence is annual; a key rotation re-encrypts every row in `private.provider_secrets` in a background job. The job is idempotent and resumable.
- Adding a new provider is a slightly heavier change because every change goes through `docs/agent/change-impact-matrix.md` §13 (provider) and now also touches the Settings UI.
- comtammatu W4 migration of existing `system_settings.MOMO_*`/`einvoice_*` columns into the new tables — see Migration section above.

## Alternatives Considered

### Alt A — Keep per-tenant credentials in `.env` (status quo before this ADR)

Rejected. Ineligible from the moment the second tenant exists. Even with a single tenant, makes credential rotation a redeploy event and bottlenecks the owner on engineering.

### Alt B — Store credentials in `public.provider_settings` with column-level GRANT

Rejected. RLS gives row-level isolation, but column-level grants on a public schema are a maintenance hazard: every new helper, view, or RPC must remember to exclude the credential columns. A separate `private` schema is a single revoke against `public, anon, authenticated` and a single audit surface.

### Alt C — Use Supabase Vault (or any external secrets manager) for everything per-tenant

Considered. Reasonable for production, especially as a KMS provider. Not chosen as the primary mechanism because:

- The sealing key still needs a stable reference in `.env`; nothing changes about the deployment-level surface.
- Webhook handlers and provider adapters need synchronous decryption inside the Postgres transaction or the Next.js Server Action; an external Vault round-trip per webhook adds latency on a hot path.
- pgsodium gives equivalent guarantees for AES-256-GCM at row level inside the database, with no extra network hop.

External Vault is allowed as the KMS provider behind `MATU_KMS_KEY_REF` if the operator chooses; the schema does not change.

### Alt D — Single `tenant_secrets` table covering legal, branding, and credentials all in one

Rejected. Conflates secret and non-secret data, forces an encryption pass on every read of a non-secret value, and makes UI permission scoping awkward (`branding.logo_url` and `momo.secret_key` need different permission keys, audit classes, and rotation semantics).

## Cross-References

- `docs/architecture/schema.md` §"Audit, Jobs, And Provider Internals" — names `provider_settings`, `tenant_settings`, `private.provider_secrets` (W0' deliverable).
- `docs/architecture/schema-p0-ddl.md` §"Tenant Configuration" — column-level DDL (W0' deliverable).
- ADR-0011: MFA freshness check used by `set_provider_secret` and `update_tenant_legal_profile`.
- `tasks/regressions.md`: `ENV-NO-PER-TENANT-SECRETS`, `ENV-NO-PER-BRANCH-SECRETS`, `PROVIDER-CREDENTIAL-ROTATION`, `AUDIT-CREDENTIAL-ALLOWLIST`, `AUDIT-REDACTION-HELPER`, `MFA-RECENT-AAL2-FOR-SENSITIVE-RPCS`, `SECURITY-DEFINER-SEARCH-PATH`.
- `packages/security/src/redact-credentials.ts` — redaction helper used before any audit/log write of provider material.
- `packages/integrations/src/base.ts` — `ProviderAdapter` interface; secret loading is orthogonal to the adapter contract.
- `apps/web/app/admin/settings/*` — UI surface.

## Acceptance

- [ ] Owner accepts this ADR (status flips to `accepted`).
- [ ] `docs/architecture/schema-p0-ddl.md` ships column-level DDL for `tenant_settings`, `provider_settings`, and `private.provider_secrets` with RLS contract.
- [ ] `packages/shared/src/auth/module-acl.ts` adds `settings:tenant_manage` (the `settings:provider_configure` key already exists); `pnpm acl:build` regenerates Dart mirror.
- [ ] `packages/integrations` ships `provider-secrets.ts` server-only helper interface; the W1 baseline migration ships the encrypt/decrypt path.
- [ ] `apps/web/app/admin/settings/*` route placeholders exist with `PageSurface` chrome and a "configured in W2/W3" status before the runtime lands.
- [ ] `/admin/settings/legal` editing MST appends a new `tenant_legal_profiles` row, never edits the previous one (test in `supabase/tests/`).
- [ ] `/admin/settings/integrations/{provider}` save calls `set_provider_secret`, verifies via mock provider, never logs the plaintext secret (test in `packages/security`).
- [ ] `.env.example` continues to contain only deployment-level keys plus empty `DEV_*` slots; no `VIETQR_*`, `MOMO_*`, `EINVOICE_*` top-level keys.
- [ ] W4 migration of existing `system_settings.MOMO_*`/`einvoice_*` columns completed.

## Owner Sign-Off

```
Owner name:        ____________________________
Tech Lead:         ____________________________
Date signed:       ____________________________
PR or commit ref:  ____________________________
```

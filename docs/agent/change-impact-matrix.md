# Change Impact Matrix

This file is the binding map of "when you change X, also update Y in the same PR".

> **Adopted 2026-05-07 from matu-superapp/docs/agent/change-impact-matrix.md** per /autoplan UC3. Path references adapted for comtammatu (`docs/plan/adr/` instead of `docs/adr/`, `apps/web/` instead of `apps/backoffice_web/`).

Doc drift between an architectural decision and the rules/specs/tests that should reflect it is a recurring failure mode. This matrix prevents that drift by enumerating, for each kind of change, every other file that must move with it.

Read this BEFORE opening a PR. The PR description must list which row(s) of this matrix apply and confirm each affected file was updated.

Enforced by:

- `tasks/regressions.md` rule `SAME-PR-DOC-SYNC`.
- `scripts/check-doc-cross-references.mjs` in CI (catches orphan references and broken links).
- CONTRIBUTING.md PR checklist (W0' deliverable).

## How To Use

1. Identify the change type from the **Change Types** table below.
2. Open the corresponding section to see the required update list.
3. Apply every required update in the same PR. If a row is genuinely not applicable, state why in the PR description.
4. Run `node scripts/check-doc-cross-references.mjs` locally. It must exit `0` (or remain at baseline tail per `tasks/lint-baseline.md`).

## Change Types

| Change type | Section |
|---|---|
| Add a new ADR | §1 |
| Update an ADR (clarify, add alternative, change recommendation) | §2 |
| Delete or supersede an ADR | §3 |
| Add a regression rule | §4 |
| Rename or remove a regression rule | §5 |
| Add a new rule file under `docs/agent/rules/` | §6 |
| Add a new table to the schema | §7 |
| Add a new permission key | §8 |
| Add a new role or change the role catalog | §9 |
| Add a Flutter flavor | §10 |
| Change the stack baseline (framework, language, package manager, library pin) | §11 |
| Add a permission-bearing Server Action or RPC | §12 |
| Add a payment method, e-invoice provider, or webhook source | §13 |
| Change the LAN/BT transport contract | §14 |
| Change `.env.example` | §15 |
| Change canonical route families | §16 |

## §1 Add A New ADR

When you add `docs/plan/adr/NNNN-*.md`:

- [ ] Create the ADR file with `Status: proposed`, `Date`, `Decision owner`.
- [ ] Add to `docs/plan/adr/README.md` "ADR Set" table and "Required ADRs Before W1 Implementation" list (if it gates W1).
- [ ] Add to `docs/agent/rules/references.md` "Architecture Decisions" section (when rules file exists).
- [ ] Add to `AGENTS.md` "Critical Engineering Constraints" W1 ADR list (if it gates W1).
- [ ] Cross-link from any sibling ADR whose decision depends on or interacts with this one.
- [ ] If the ADR introduces a deadline, add a row to `tasks/todo.md` P0 Decision section.
- [ ] If the ADR introduces an enforced invariant, add a row to `tasks/regressions.md` and link.

## §2 Update An ADR

When you modify an existing ADR:

- [ ] Update the `Date` line on the ADR (keep `Status` as `proposed` or `accepted` per workflow).
- [ ] If the change affects forward references in other docs, sweep all references and update wording (don't leave stale wording).
- [ ] If acceptance gates change, update `tasks/todo.md` decision rows that reference the ADR.
- [ ] If a regression rule is added/changed, update `tasks/regressions.md` in the same PR.

## §3 Delete Or Supersede An ADR

When an ADR is retired:

- [ ] Delete the ADR file (history lives in git).
- [ ] Remove from `docs/plan/adr/README.md` index.
- [ ] Remove from `AGENTS.md` W1 ADR list.
- [ ] Sweep every other doc for forward references (`grep -rn "ADR-NNNN" docs/ tasks/ apps/ packages/ scripts/`) and rewrite to describe the present truth without graveyard wording (no "superseded", no "retired", no "REMOVED").
- [ ] If a regression rule referenced the retired ADR, rewrite the rule to be self-contained.
- [ ] Run `scripts/check-doc-cross-references.mjs` to confirm no orphan references remain (or remain at baseline tail).

## §4 Add A Regression Rule

When you add a rule to `tasks/regressions.md`:

- [ ] Use the `**RULE-NAME**:` named-rule format (post-B54 conversion). Format: `- **RULE-NAME**: positive prescription. Rationale + detection. Reference: ...`
- [ ] Place it under the right section (Security/Auth, Realtime, Payments/POS, KDS, Inventory, Finance, HR, Branch Hub, Print/Providers, UI, Build).
- [ ] Make the rule a positive prescription that can be tested or reviewed; do not embed historical anecdotes.
- [ ] If the rule is enforceable by lint, add or extend a script in `scripts/` and wire it into `pnpm lint` (or document the gap until baseline is cleared).
- [ ] If the rule binds a specific surface, add a one-line cross-reference from the relevant `docs/agent/rules/*.md` file (when rules files exist).

## §5 Rename Or Remove A Regression Rule

When you rename or remove a rule name:

- [ ] Update the rule name in `tasks/regressions.md`.
- [ ] Sweep every other doc for the old rule name (`grep -rn "OLD-RULE-NAME" docs/ tasks/ apps/ packages/ scripts/`) and update to the new name (or remove if the rule is deleted).
- [ ] If a script enforces the rule, update the script's user-facing error message and comment header.

## §6 Add A New Rule File

When you add `docs/agent/rules/<name>.md`:

- [ ] Create the file.
- [ ] Add to `AGENTS.md` "Rule Loading" section.
- [ ] Add to `docs/agent/README.md` "Agent Startup Checklist" (when this file exists).
- [ ] Add to `docs/agent/rules/references.md` "Rule Files" section (when this file exists).

## §7 Add A New Table

When you add a table to the schema:

- [ ] Add the table row to `docs/spec/database-schema.md` in the right domain section.
- [ ] Determine RLS class (A–E per auth-and-permissions doc) and add the policy template note.
- [ ] Add migration file under `supabase/migrations/`.
- [ ] Add SQL test under `supabase/tests/` for at least one negative-access case.
- [ ] Run `pnpm db:types` after applying the migration to dev.
- [ ] If the table participates in Realtime, update the publication allowlist note and the `REALTIME-PUBLICATION-ALLOWLIST` rule.

## §8 Add A New Permission Key

When you add a permission like `pos:new_action`:

- [ ] Add to `packages/shared/src/auth/permissions.ts` permission catalog.
- [ ] Add to `packages/shared/src/auth/module-acl.ts` route ACL (if route-level).
- [ ] Add to the seed migration for the `permission_keys` table.
- [ ] Regenerate Dart mirror once `scripts/generate-acl-dart.mjs` exists (post-W5).
- [ ] Add an SQL test confirming a role without the permission is rejected by the gating RPC.

## §9 Add A New Role Or Change The Role Catalog

When you change the role catalog:

- [ ] Update `packages/shared/src/auth/module-acl.ts` role precedence list.
- [ ] Update business-context references and glossary.
- [ ] Update `tasks/regressions.md` `ROLE-PRECEDENCE-DETERMINISTIC` rule's precedence list if the order changes.
- [ ] Add seed rows in the role/permission seed migration.
- [ ] Add SQL tests for the new role's tenant-wide vs branch-scoped status.

## §10 Add A Flutter Flavor

When you add a flavor (e.g., `customer_app`):

- [ ] Add `apps/frontline_flutter/lib/main_<flavor>.dart` entry point.
- [ ] Add `apps/frontline_flutter/lib/roles/<flavor>/` folder.
- [ ] Add `apps/frontline_flutter/android/app/src/<flavor>/AndroidManifest.xml` with the minimum permission set for that flavor.
- [ ] Update `docs/architecture/client-strategy.md` "Client Split" table (W0' deliverable).
- [ ] Update `docs/plan/adr/0006-frontline-flutter-client.md` Decision section flavor list.
- [ ] Update `docs/plan/adr/0010-flutter-implementation-choices.md` "Per-Flavor Permission Set" table.
- [ ] Add the flavor to flutter build commands in `package.json` scripts.

## §11 Change The Stack Baseline

When you bump or change a stack pin (Node, pnpm, Next.js, React, TS, Tailwind, Flutter, Dart, supabase-js, supabase_flutter, Zod, Drift, etc.):

- [ ] Update `AGENTS.md` "Stack Baseline" section.
- [ ] Update `CLAUDE.md` stack reference.
- [ ] If the change is a major framework bump, add an ADR or release note.
- [ ] Update `package.json` / `pubspec.yaml` exact pin.
- [ ] Update `.nvmrc` / `.node-version` for Node bumps.
- [ ] Run full verify path (`pnpm typecheck && lint && build && test` plus Flutter analyze/test post UC1).

## §12 Add A Permission-Bearing Server Action Or RPC

When you add a write RPC or Server Action:

- [ ] Confirm the gating permission key exists (or add it via §8).
- [ ] Implement permission check inside the RPC (`has_permission_any('...')`), not only in the UI.
- [ ] Add SQL test that a role without the permission gets `42501`.
- [ ] If the action mutates money, stock, or HĐĐT state, list applicable regressions in the PR description (e.g., `PAYMENT-RECOMPUTE-TOTAL`, `STOCK-CONSUME-CHECK-RESULT`).
- [ ] If the action runs inside emergency mode, ensure it is in the `EMERGENCY-RPC-SCOPE-RESTRICTED` allowlist or explicitly excluded.
- [ ] If the action is sensitive (period close, payroll approve, secret rotation, tenant legal change), gate via `require_recent_aal2()` per ADR-0011.

## §13 Add A Payment Method / E-Invoice Provider / Webhook Source

When you add a provider:

- [ ] Implement the `ProviderAdapter` interface in `packages/integrations/src/<provider>/` (per ADR-0009).
- [ ] Add mock + sandbox + production adapter implementations (mock parity per `PROVIDER-MOCK-PARITY`).
- [ ] If webhooks exist, declare the `webhook_events.provider` enum value in `tasks/regressions.md` `WEBHOOK-IDEMPOTENT` rule and the schema.
- [ ] Add the provider mode flag to `.env.example` (mode flag only — no per-tenant credentials).
- [ ] Per-tenant credentials go to `private.provider_secrets` per ADR-0012, never `.env` (`ENV-NO-PER-TENANT-SECRETS`).

## §14 Change The LAN/BT Transport Contract

When you change pairing, HMAC envelope, monotonic counter, or transport tier (per ADR-0007):

- [ ] Update `docs/architecture/client-strategy.md` "Multi-Transport Policy" and "Pairing Flow" (W0' deliverable).
- [ ] Update `docs/plan/adr/0007-branch-hub-architecture.md` if the change affects the architectural decision.
- [ ] Update `tasks/regressions.md` `TRANSPORT-*` and `HUB-LAN-AUTH-MANDATORY` rules if invariants change.
- [ ] Update `apps/frontline_flutter/packages/matu_lan_transport/` once runtime exists.
- [ ] Add an integration test covering the new contract.

## §15 Change `.env.example`

When you add or remove a variable in `.env.example`:

- [ ] Confirm the variable is **deployment-level only** (not per-tenant or per-branch). If per-tenant, route through `private.provider_secrets` per ADR-0012. If per-branch, route through `private.branch_lan_pairing_secrets`.
- [ ] Use a safe placeholder value (`mock-*`, `replace-with-*`, or empty string).
- [ ] Add a brief inline comment describing what the variable controls.
- [ ] Cross-check `ENV-NO-PER-TENANT-SECRETS` and `ENV-NO-PER-BRANCH-SECRETS` rules — your variable must comply.

## §16 Change Canonical Route Families

When you add, rename, or remove a route family in `apps/web/app/`:

- [ ] Update `AGENTS.md` "Architecture" section if the route family is canonical.
- [ ] Update `CLAUDE.md` route ownership if listed there.
- [ ] Update `docs/plan/system-rebuild/05-MODULE-CATALOG.md` page contracts for the affected module.
- [ ] If the change adds a route family, update relevant module catalog section.

## Backstop: Run The Cross-Reference Checker

For every change, before opening the PR:

```bash
node scripts/check-doc-cross-references.mjs
```

The cross-reference checker catches:

- ADR file references (`ADR-NNNN`) where the file is missing.
- Markdown links to `docs/...` paths where the target file is missing.
- Regression rule names mentioned in non-rule docs that do not exist in `tasks/regressions.md` (post-B54 named-rule format).

A non-zero exit means at least one of the rows above was not applied. Fix in the same PR (or document the new failure as baseline tail in `tasks/lint-baseline.md` if it's pre-existing).

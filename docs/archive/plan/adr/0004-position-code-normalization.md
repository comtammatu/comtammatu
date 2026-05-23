# ADR-0004: Identifier Language And Position Code Normalization

> **Archived 2026-05-23:** Greenfield/blue-green rebuild ADR. Active delivery continues in-place via `tasks/todo.md`; use this only as historical context unless owner reactivates the rebuild program.

> **Status:** PROPOSED
> **Date:** 2026-05-05
> **Decider:** Architect -> Owner sign-off (B9)
> **Context:** Whole-system rebuild — `docs/plan/system-rebuild/02-GREEN-BASELINE.md`

---

## Context

The blue project mixes identifier languages. Most DB tables/RPCs are English, but
some persisted contract values use romanized Vietnamese or mixed casing:

| Blue identifier | Problem | Source |
| --- | --- | --- |
| `quan_ly_CN` | Vietnamese token + mixed case | `20260422120001_auth_v2_seed_catalog.sql` |
| `quan_ly_vung` | Vietnamese token | same migration |
| `tro_ly_giam_doc` | Vietnamese token | same migration |
| `ke_toan`, `ke_toan_truong` | Vietnamese token | same migration |
| `kho_truong`, `thu_kho` | Vietnamese token | same migration |
| `bep_truong`, `phu_bep` | Vietnamese token | same migration |
| `create=cap-bep` | Vietnamese URL token | inventory transfer route |

This violates `docs/ref/glossary.md`: code, DB schema, types, RPCs, payloads,
file paths, and other technical identifiers must be English. Vietnamese belongs
in UI copy, labels, seeded business data, and documentation narrative.

The confusion matters because these values are not just display text. They are
used by `positions.code`, `role_templates.position_code`, SQL whitelists, URL
query params, tests, docs, and operator runbooks. Porting them into green would
make the new baseline inherit blue naming debt.

---

## Decision

**Green baseline persisted identifiers must use English `lower_snake_case` or
English route/query slugs. Do not create new romanized Vietnamese identifiers.**

Position code mapping for green:

| Blue code | Green code | `legacy_role_code` |
| --- | --- | --- |
| `owner` | `owner` | `owner` |
| `super_manager` | `executive_manager` | `super_manager` |
| `tro_ly_giam_doc` | `executive_assistant` | `super_manager` |
| `quan_ly_vung` | `area_manager` | `area_manager` |
| `quan_ly_CN` | `branch_manager` | `branch_manager` |
| `ke_toan_truong` | `chief_accountant` | `office` |
| `ke_toan` | `accountant` | `office` |
| `office` | `office_admin` | `office` |
| `kho_truong` | `warehouse_head` | `warehouse_manager` |
| `thu_kho` | `warehouse_keeper` | `warehouse_manager` |
| `bep_truong` | `head_chef` | `production_manager` |
| `chef` | `chef` | `chef` |
| `phu_bep` | `kitchen_helper` | `chef` |
| `cashier` | `cashier` | `cashier` |
| `waiter` | `waiter` | `waiter` |

URL/API token mapping:

| Blue token | Green token |
| --- | --- |
| `cap-bep` | `kitchen-replenishment` |

Implementation in green baseline migration:

```sql
-- positions.code values use English lower_snake_case per ADR-0004.
ALTER TABLE public.positions
  ADD CONSTRAINT positions_code_english_lower_snake
  CHECK (code ~ '^[a-z][a-z0-9_]*$');

-- role_templates.position_code follows the same convention when present.
ALTER TABLE public.role_templates
  ADD CONSTRAINT role_templates_position_code_english_lower_snake
  CHECK (position_code IS NULL OR position_code ~ '^[a-z][a-z0-9_]*$');
```

Migration import from blue to green maps old values at the boundary:

```sql
CASE code
  WHEN 'super_manager' THEN 'executive_manager'
  WHEN 'tro_ly_giam_doc' THEN 'executive_assistant'
  WHEN 'quan_ly_vung' THEN 'area_manager'
  WHEN 'quan_ly_CN' THEN 'branch_manager'
  WHEN 'ke_toan_truong' THEN 'chief_accountant'
  WHEN 'ke_toan' THEN 'accountant'
  WHEN 'office' THEN 'office_admin'
  WHEN 'kho_truong' THEN 'warehouse_head'
  WHEN 'thu_kho' THEN 'warehouse_keeper'
  WHEN 'bep_truong' THEN 'head_chef'
  WHEN 'phu_bep' THEN 'kitchen_helper'
  ELSE code
END
```

Keep `positions.legacy_role_code` as the compatibility bridge for JWT
`user_role` and route ACL until the app no longer compares legacy role strings.

---

## Function And RPC Naming Rule

New public RPC/function names use:

- English `lower_snake_case`
- verb-first command names for mutations: `create_payment`, `confirm_stock_issue`
- `get_` / `list_` / `find_` / `compute_` for read/calculation functions
- `trg_` prefix only for trigger functions
- leading `_domain_` only for private/internal helpers

Avoid new `fn_` prefixes. Existing statutory/report functions such as
`fn_generate_b03_dn` and `fn_generate_form_01_gtgt` are blue compatibility names;
green should prefer `generate_vas_b03_dn` and `generate_vat_form_01_gtgt` unless
external compliance tooling requires the exact old name. Legal form acronyms
(`B03_DN`, `01_GTGT`, `CQT`, `PIT`, `BHXH`) may appear only when they are the
statutory form/code being represented.

---

## Alternatives Considered

### A. Only normalize `quan_ly_CN` to `quan_ly_cn`

- **Pro:** smallest change.
- **Con:** leaves the bigger language drift intact (`bep_truong`, `kho_truong`,
  `ke_toan`, etc.).
- **Rejected** because it fixes casing while preserving mixed-language schema.

### B. Keep blue values forever

- **Pro:** zero migration cost.
- **Con:** green baseline starts with known naming debt and contradicts the
  glossary.
- **Rejected**.

### C. Drop position codes and rely on IDs only

- **Pro:** no string drift possible.
- **Con:** readable codes are useful for SQL debugging, data audit, and RBAC
  discussion.
- **Rejected**. Keep stable codes, but make them English.

---

## Consequences

### Positive

- One language contract for schema/API/code identifiers.
- Clear distinction between HR labels (`label_vi`) and persisted codes.
- Green baseline starts clean; blue drift is handled only at migration/import
  boundaries.
- Future grep and CI checks can enforce simple patterns.

### Negative

- More import mapping than the original casing-only ADR.
- Tests and docs that mention old codes need a one-time update.
- Audit logs and historical rows may still mention old codes; those should
  remain immutable history.

### Mitigations

| Risk | Mitigation |
| --- | --- |
| Missed reference in app code | Grep old codes before W0 and block merge if found outside archive/migration import fixtures. |
| JWT role compatibility breaks | Preserve `positions.legacy_role_code` until route ACL no longer reads `user_role`. |
| Operator docs become confusing | Docs must say "blue legacy code" vs "green canonical code" when both are shown. |
| Audit history contains old values | Do not rewrite audit logs; treat old values as historical facts. |

---

## Verification

Before cutover:

1. `SELECT code FROM positions` in green returns English `lower_snake_case` only.
2. `SELECT position_code FROM role_templates WHERE position_code IS NOT NULL`
   returns English `lower_snake_case` only.
3. Import rehearsal maps every blue position row to exactly one green row.
4. Grep old position tokens in `apps/`, `packages/`, and green migrations returns
   zero hits, excluding archived blue migrations and migration import fixtures.
5. URL/query tests use `kitchen-replenishment`, not `cap-bep`.
6. JWT claims still emit the expected `legacy_role_code` values for existing ACL.

Post-cutover:

- New rows cannot insert non-English/mixed-case position codes because of CHECK
  constraints.
- New RPC/function review follows the Function And RPC Naming Rule above.

---

## References

- `docs/ref/glossary.md` — identifier language contract
- `docs/plan/system-rebuild/02-GREEN-BASELINE.md` — do not port schema debt
- `docs/plan/system-rebuild/03-DATA-MIGRATION-POLICY.md` — blocker list
- `docs/plan/10-ROADMAP.md` — B9 owner sign-off

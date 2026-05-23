# Data Audit — How to Run

> **Suspended 2026-05-23:** This greenfield/blue-green rebuild pack is historical reference only. Active delivery continues in-place via `tasks/todo.md`. Do not apply freeze/cutover instructions unless the owner explicitly reactivates this program.

> **Status:** TEMPLATES READY — pending B1+B2+B10 sign-off in `docs/plan/10-ROADMAP.md`
> **Owner:** architect + 1 dev (read-only blue access)
> **Output:** `audit/results-YYYY-MM-DD.md` committed to repo

This audit produces the input that resolves every `DEFER_DECISION` in `03-DATA-MIGRATION-POLICY.md` §"Blockers" and feeds the sign-off table.

---

## §1. Run order

```bash
# 1. Connect to BLUE Supabase project (read-only role).
psql "$BLUE_DATABASE_URL_READONLY" -v ON_ERROR_STOP=1

# 2. Run the full query file.
\i docs/plan/system-rebuild/audit/queries.sql > audit/results-$(date +%F).raw

# 3. Convert raw output to markdown report (template below).
# Template: audit/results-YYYY-MM-DD.md
```

**Required permissions on blue role**: `pg_read_all_data`, `pg_read_all_stats`, plus `SELECT` on `auth.*`. Reach via service-role key in 1-week-expiring vault token (B10 sign-off).

**DO NOT** run with write role. Audit is read-only.

---

## §2. Audit outputs (per `03-DATA-MIGRATION-POLICY.md` §"Audit Outputs")

| Output | Source query | Goes into |
|---|---|---|
| Row counts by table | `queries.sql §1` | Classification table column "rows" |
| Approximate size by table | `queries.sql §2` | Migration cost estimate |
| Last write timestamp | `queries.sql §3` | Detect dead tables |
| FK dependency graph | `queries.sql §4` | Drop order computation |
| RLS/function/API references | `queries.sql §5` | Cannot-drop blockers |
| Storage bucket counts + bytes | `queries.sql §6` | Storage migration cost |
| External provider IDs (webhooks, payment refs) | `queries.sql §7` | Reconciliation post-cutover |
| Pending operational data (V1 blockers) | `queries.sql §8` | Resolve before cutover |
| Auth user count + identities | `queries.sql §9` | Auth migration plan (ADR-0001) |
| Position code casing distribution | `queries.sql §10` | Position normalization (ADR-0004) |

---

## §3. Output format

Commit one markdown file per audit run:

```
docs/plan/system-rebuild/audit/results-YYYY-MM-DD.md
```

**Required sections**:

```markdown
# Data Audit Results — YYYY-MM-DD

> Run by: <name>
> Blue project: <project-ref>
> Snapshot timestamp (UTC): <ISO8601>
> Duration: <minutes>

## §1. Row counts (top 50 tables by rows)
| schema.table | rows | last_write |
|---|---|---|
| ... | ... | ... |

## §2. Size by table (top 30 by total_bytes)
...

## §3. Tables with 0 writes in last 90 days
...

## §4. Storage buckets
| bucket | objects | total_bytes |
|---|---|---|
| grn-evidence | ... | ... |

## §5. V1 blockers (pending data)
| query | count | resolution required |
|---|---|---|
| pending stocktake_conflicts | ... | resolve via UI before cutover |
| pending grn_hardblock_overrides | ... | resolve before cutover |
| supplier_invoices count | ... | MIGRATE if AP scope confirmed |
| user_trust_score rows | ... | ARCHIVE_ONLY recommended |

## §6. Auth
| metric | count |
|---|---|
| auth.users active | ... |
| auth.users banned | ... |
| auth.identities email | ... |

## §7. Position codes
| position_code | profiles_with_this | template_exists |
|---|---|---|
| quan_ly_CN | ... | yes |

## §8. External provider IDs
| provider | id_count | sample (redacted) |
|---|---|---|
| momo | ... | ... |
| vietqr | ... | ... |
| hddt | ... | ... |
```

---

## §4. Classification follow-up

After raw results land, fill `classification-template.md` (one row per blue artifact). Each row gets one of: `MIGRATE` / `ARCHIVE_ONLY` / `DROP_ACCEPTED` / `REBUILD_FROM_SOURCE` / `DEFER_DECISION` (default if unclear).

`DEFER_DECISION` rows MUST resolve before W6 cutover (`04-CUTOVER-QA-RUNBOOK.md` §"Go/No-Go" rule #1).

---

## §5. Privacy + storage

- Audit raw output **MAY contain PII** (email, phone) → save in `.gitignore`'d local file first, redact before committing markdown.
- Sample sizes in committed markdown: max 5 rows, all PII redacted (`a***@b.com`, `09**`).
- Storage bucket sample listing: bucket name + count only, no object keys.

---

## §6. Re-run policy

- Re-run audit **before each cutover rehearsal** (per `04-CUTOVER-QA-RUNBOOK.md` §"Pre-Rehearsal" #2).
- Re-run **before final cutover** (per §"Pre-Cutover" #5).
- Diff between runs flags new V1 surface that snuck in — should be empty after consolidation freeze.

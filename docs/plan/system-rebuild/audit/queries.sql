-- ============================================================================
-- Data Audit Queries — Blue Supabase Project
-- Per docs/plan/system-rebuild/03-DATA-MIGRATION-POLICY.md §"Audit Outputs"
--
-- Run with READ-ONLY role. Output: pipe to file, redact PII, transform to
-- markdown per audit/README.md §3.
--
-- ALL queries assume `public` schema is the primary tenant scope. Adjust
-- `auth.*` queries with appropriate role (service_role for auth schema).
-- ============================================================================

\timing on
\pset pager off

-- =====================================================
-- §1. Row counts (top 50 user tables, ordered by row count desc)
-- =====================================================
SELECT
  c.relnamespace::regnamespace || '.' || c.relname AS table_name,
  c.reltuples::bigint AS approx_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
WHERE c.relkind IN ('r', 'p')
  AND c.relnamespace::regnamespace::text NOT IN (
    'pg_catalog', 'information_schema', 'pg_toast', 'extensions'
  )
ORDER BY c.reltuples DESC
LIMIT 50;

-- =====================================================
-- §2. Size by table (top 30 by total_bytes including indexes/toast)
-- =====================================================
SELECT
  c.relnamespace::regnamespace || '.' || c.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_size_pretty(pg_relation_size(c.oid)) AS heap_size,
  pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
  pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
WHERE c.relkind IN ('r', 'p', 'm')
  AND c.relnamespace::regnamespace::text NOT IN (
    'pg_catalog', 'information_schema', 'pg_toast', 'extensions'
  )
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 30;

-- =====================================================
-- §3. Last write timestamp (best-effort via pg_stat_user_tables)
-- Tables with no INSERT/UPDATE/DELETE in last 90 days = candidate for ARCHIVE
-- =====================================================
SELECT
  schemaname || '.' || relname AS table_name,
  n_tup_ins, n_tup_upd, n_tup_del,
  GREATEST(last_autoanalyze, last_analyze, last_autovacuum, last_vacuum) AS last_activity,
  CASE
    WHEN last_autoanalyze IS NULL AND last_analyze IS NULL THEN 'NEVER ANALYZED'
    WHEN GREATEST(last_autoanalyze, last_analyze) < now() - interval '90 days' THEN 'STALE > 90d'
    ELSE 'ACTIVE'
  END AS status
FROM pg_stat_user_tables
ORDER BY last_activity NULLS FIRST
LIMIT 100;

-- =====================================================
-- §4. FK dependency graph (drop order computation)
-- For each FK: source table → target table. Reverse-topological for safe drop.
-- =====================================================
SELECT
  conrelid::regclass::text AS source_table,
  conname AS constraint_name,
  confrelid::regclass::text AS target_table,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY source_table, target_table;

-- =====================================================
-- §5. RLS policies + function references per table
-- Detects "cannot drop X because RLS policy/function references it"
-- =====================================================
-- §5a. RLS policies count by table
SELECT
  schemaname || '.' || tablename AS table_name,
  count(*) AS policy_count,
  array_agg(policyname ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY policy_count DESC;

-- §5b. Functions referencing tables (best-effort via prosrc grep)
-- Run for each candidate-drop table:
--   SELECT proname FROM pg_proc WHERE prosrc LIKE '%<table_name>%' AND pronamespace = 'public'::regnamespace;
-- Generate per V1-candidate:
SELECT
  p.proname AS function_name,
  p.pronargs AS arg_count,
  pg_get_function_identity_arguments(p.oid) AS signature
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosrc ~* '(user_trust_score|grn_hardblock_overrides|branch_express_window|grn_express_audit|stocktake_conflicts|stocktake_drafts|stocktake_zone_locks|stocktake_offline_batches|branch_override_codes|branch_daily_waste_caps|supplier_price_list|supplier_items|supplier_invoices|supplier_payments|supplier_credit_notes|supplier_returns|ingredient_category_review_policy)'
ORDER BY p.proname;

-- =====================================================
-- §6. Storage buckets (run via Supabase CLI / SQL)
-- =====================================================
SELECT
  b.name AS bucket_name,
  b.public,
  count(o.id) AS object_count,
  pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) AS total_size,
  coalesce(sum((o.metadata->>'size')::bigint), 0) AS total_bytes
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.name, b.public
ORDER BY total_bytes DESC;

-- =====================================================
-- §7. External provider IDs (webhooks, payment refs)
-- =====================================================
-- §7a. Payment provider refs by status
SELECT
  provider,
  status,
  count(*) AS count,
  min(created_at) AS oldest,
  max(created_at) AS newest
FROM public.payments
GROUP BY provider, status
ORDER BY provider, status;

-- §7b. HĐĐT (e-invoice) state distribution
SELECT
  status,
  count(*) AS count,
  count(*) FILTER (WHERE issued_at IS NOT NULL) AS issued,
  count(*) FILTER (WHERE archived_at IS NOT NULL) AS archived
FROM public.tax_invoices
GROUP BY status
ORDER BY count DESC;

-- §7c. Webhook events count by provider
SELECT
  provider,
  count(*) AS event_count,
  min(received_at) AS first_event,
  max(received_at) AS last_event
FROM public.webhook_events
GROUP BY provider
ORDER BY event_count DESC;

-- =====================================================
-- §8. V1 blockers — pending operational data
-- These rows MUST resolve before cutover (per 03-DATA-MIGRATION-POLICY §Blockers)
-- =====================================================
-- §8a. Pending stocktake conflicts
SELECT
  count(*) AS pending_count,
  count(DISTINCT session_id) AS sessions_affected,
  min(created_at) AS oldest_conflict
FROM public.stocktake_conflicts
WHERE resolved_at IS NULL;

-- §8b. Pending hardblock overrides
SELECT
  status,
  count(*) AS count
FROM public.grn_hardblock_overrides
GROUP BY status;

-- §8c. AP scope tables row counts
SELECT 'supplier_invoices' AS table_name, count(*) AS rows FROM public.supplier_invoices
UNION ALL
SELECT 'supplier_payments', count(*) FROM public.supplier_payments
UNION ALL
SELECT 'supplier_credit_notes', count(*) FROM public.supplier_credit_notes
UNION ALL
SELECT 'supplier_returns', count(*) FROM public.supplier_returns
UNION ALL
SELECT 'supplier_price_list', count(*) FROM public.supplier_price_list
UNION ALL
SELECT 'supplier_items', count(*) FROM public.supplier_items;

-- §8d. V1 retired feature data
SELECT 'user_trust_score' AS table_name, count(*) AS rows FROM public.user_trust_score
UNION ALL
SELECT 'branch_express_window', count(*) FROM public.branch_express_window
UNION ALL
SELECT 'grn_express_audit', count(*) FROM public.grn_express_audit
UNION ALL
SELECT 'branch_override_codes', count(*) FROM public.branch_override_codes
UNION ALL
SELECT 'branch_daily_waste_caps', count(*) FROM public.branch_daily_waste_caps
UNION ALL
SELECT 'ingredient_category_review_policy', count(*) FROM public.ingredient_category_review_policy
UNION ALL
SELECT 'stocktake_drafts', count(*) FROM public.stocktake_drafts
UNION ALL
SELECT 'stocktake_zone_locks', count(*) FROM public.stocktake_zone_locks
UNION ALL
SELECT 'stocktake_offline_batches', count(*) FROM public.stocktake_offline_batches;

-- =====================================================
-- §9. Auth — user count + identity providers (run as service_role)
-- =====================================================
SELECT
  count(*) AS total_users,
  count(*) FILTER (WHERE banned_until > now()) AS banned_now,
  count(*) FILTER (WHERE deleted_at IS NULL) AS active_users,
  count(*) FILTER (WHERE last_sign_in_at > now() - interval '30 days') AS active_30d,
  count(*) FILTER (WHERE last_sign_in_at > now() - interval '90 days') AS active_90d
FROM auth.users;

SELECT
  provider,
  count(*) AS identity_count
FROM auth.identities
GROUP BY provider
ORDER BY identity_count DESC;

-- =====================================================
-- §10. Position code casing distribution
-- Detect drift; ADR-0004 normalizes to snake_case lowercase
-- =====================================================
SELECT
  position_code,
  count(*) AS profile_count,
  exists(SELECT 1 FROM public.role_templates rt WHERE rt.position_code = po.code) AS has_role_template
FROM public.profiles pr
JOIN public.positions po ON pr.position_id = po.id
GROUP BY position_code
ORDER BY position_code;

-- Drift detection: any code containing uppercase letter
SELECT
  code AS position_code,
  legacy_role_code,
  count(pr.id) AS profile_count
FROM public.positions po
LEFT JOIN public.profiles pr ON pr.position_id = po.id
WHERE code ~ '[A-Z]'
GROUP BY po.id, code, legacy_role_code
ORDER BY code;

-- =====================================================
-- §11. Cron job inventory (schedule audit before unschedule)
-- =====================================================
SELECT
  jobname,
  schedule,
  command,
  active
FROM cron.job
ORDER BY jobname;

-- =====================================================
-- §12. Materialized view dependency check
-- =====================================================
SELECT
  schemaname || '.' || matviewname AS mv_name,
  ispopulated,
  pg_size_pretty(pg_total_relation_size((schemaname || '.' || matviewname)::regclass)) AS size
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size((schemaname || '.' || matviewname)::regclass) DESC;

-- ============================================================================
-- END
-- ============================================================================

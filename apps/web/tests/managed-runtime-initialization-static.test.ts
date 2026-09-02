import assert from "node:assert/strict";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260727120003_initialize_materialized_views.sql");
const foldMigration = readSql(process.cwd(), "supabase/migrations/20260727120001_fold_managed_surfaces.sql");
const cronMigration = readSql(process.cwd(), "supabase/migrations/20260727120004_reregister_managed_cron_jobs.sql");

test("fresh baseline initializes current materialized views in dependency order", () => {
  const views = [
    "mv_daily_revenue",
    "mv_food_cost",
    "mv_inventory_stock_current",
    "mv_inventory_value_ranking",
  ];

  assert.deepEqual(
    [...migration.matchAll(/'public\.(mv_[a-z_]+)'::regclass/g)].map(
      (match) => match[1],
    ),
    views,
  );
  assertSqlMatch(migration, /SELECT relispopulated FROM pg_class/);
  assertSqlMatch(migration, /REFRESH MATERIALIZED VIEW %s/);
  assertSqlNotMatch(migration, /CONCURRENTLY|mv_grn_price_baseline|realtime\./);
});

test("managed cron jobs are re-registered from the canonical fold", () => {
  const scheduleNames = (source: string) =>
    [...source.matchAll(/cron\.schedule\('([^']+)'/g)].map((match) => match[1]);
  const canonicalNames = scheduleNames(foldMigration);
  const unscheduleBlock = cronMigration.slice(
    0,
    cronMigration.indexOf("PERFORM cron.schedule"),
  );

  assert.deepEqual(scheduleNames(cronMigration), canonicalNames);
  for (const name of canonicalNames) assert.match(unscheduleBlock, new RegExp(`'${name}'`));
  assert.match(unscheduleBlock, /'refresh_mv_grn_price_baseline'/);
  assert.match(unscheduleBlock, /'refresh-finance-views-daily'/);
  assertSqlMatch(cronMigration, /CREATE TABLE IF NOT EXISTS private\.cron_job_health_grace/);
  assertSqlMatch(cronMigration, /IF EXISTS \(SELECT 1 FROM public\.orders LIMIT 1\)/);
  assertSqlMatch(cronMigration, /INSERT INTO private\.cron_job_health_grace/);
  assertSqlMatch(cronMigration, /now\(\) < v_registered_at \+ v_max_age/);
  assertSqlMatch(cronMigration, /v_last_run\.start_time >= now\(\) - v_max_age/);
  assertSqlMatch(cronMigration,
    /ON CONFLICT \(tenant_id, dedup_key\)\s+WHERE dedup_key IS NOT NULL/,
  );
  assertSqlMatch(cronMigration, /PERFORM pg_reload_conf\(\)/);
  assertSqlMatch(cronMigration, /SET search_path TO ''/);
  assertSqlMatch(cronMigration, /title,\s*body,/);
  assertSqlMatch(cronMigration, /'Tác vụ tự động cần kiểm tra'/);
  assertSqlMatch(cronMigration, /ARRAY\['owner'\]::text\[\]/);
  assertSqlNotMatch(cronMigration, /ARRAY\['owner',\s*'admin'\]/);
});

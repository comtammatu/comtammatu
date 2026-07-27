import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20260727120003_initialize_materialized_views.sql",
  ),
  "utf8",
);
const foldMigration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20260727120001_fold_managed_surfaces.sql",
  ),
  "utf8",
);
const cronMigration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migrations/20260727120004_reregister_managed_cron_jobs.sql",
  ),
  "utf8",
);

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
  assert.match(migration, /SELECT relispopulated FROM pg_class/);
  assert.match(migration, /REFRESH MATERIALIZED VIEW %s/);
  assert.doesNotMatch(migration, /CONCURRENTLY|mv_grn_price_baseline|realtime\./);
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
  assert.match(cronMigration, /CREATE TABLE IF NOT EXISTS private\.cron_job_health_grace/);
  assert.match(cronMigration, /IF EXISTS \(SELECT 1 FROM public\.orders LIMIT 1\)/);
  assert.match(cronMigration, /INSERT INTO private\.cron_job_health_grace/);
  assert.match(cronMigration, /now\(\) < v_registered_at \+ v_max_age/);
  assert.match(cronMigration, /v_last_run\.start_time >= now\(\) - v_max_age/);
  assert.match(
    cronMigration,
    /ON CONFLICT \(tenant_id, dedup_key\)\s+WHERE dedup_key IS NOT NULL/,
  );
  assert.match(cronMigration, /PERFORM pg_reload_conf\(\)/);
});

import fs from "node:fs";

// The dev/e2e seed grants role_templates permission keys that
// sync_missing_permissions_from_template() materializes into staff_permissions
// at seed time; staff_permissions FKs to the permission_keys catalog seeded in
// the same file. A key granted in a template but missing from the catalog
// kills every from-empty bring-up (SQLSTATE 23503) while prod keeps working —
// this check fails it in the lint chain instead of in the e2e-smoke job.
const SEED = "apps/web/tests/fixtures/supabase-e2e/tenant.sql";
const DELEGABILITY_BASE_MIGRATION =
  "supabase/migration-archive/20260718174604_canonical_auth_role_position_cleanup.sql";
const text = fs.readFileSync(SEED, "utf8");
const DELEGABILITY_BASE_FILE = DELEGABILITY_BASE_MIGRATION.split("/").at(-1);
const migrationFiles = [
  ...fs
    .readdirSync("supabase/migration-archive")
    .filter((file) => file.endsWith(".sql") && file >= DELEGABILITY_BASE_FILE)
    .map((file) => `supabase/migration-archive/${file}`),
  ...fs
    .readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql") && !file.endsWith("_baseline.sql"))
    .map((file) => `supabase/migrations/${file}`),
].sort((left, right) => left.slice(left.lastIndexOf("/") + 1).localeCompare(right.slice(right.lastIndexOf("/") + 1)));
const migrationTexts = migrationFiles.map(
  (file) => fs.readFileSync(file, "utf8"),
);
const migrationText = migrationTexts[0];

// End each INSERT block at a semicolon that closes a line — descriptions may
// legitimately contain inline semicolons (e.g. "…HĐĐT); manager-gated").
const catalogBlock = text.match(
  /INSERT INTO public\.permission_keys[\s\S]*?;[ \t]*$/m,
);
const templateBlock = text.match(
  /INSERT INTO public\.role_templates[\s\S]*?;[ \t]*$/m,
);
if (!catalogBlock || !templateBlock) {
  console.error(
    `[seed-permissions] could not locate the permission_keys/role_templates INSERT blocks in ${SEED}`,
  );
  process.exit(1);
}

const catalog = new Set(
  [...catalogBlock[0].matchAll(/^\s*\('([a-z_]+:[a-z_]+)'/gm)].map((m) => m[1]),
);
const granted = new Set(
  [...templateBlock[0].matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((m) => m[1]),
);

const missing = [...granted].filter((k) => !catalog.has(k)).sort();
if (missing.length > 0) {
  console.error(
    `[seed-permissions] role_templates grant keys missing from the permission_keys catalog in ${SEED}:`,
  );
  for (const k of missing) console.error(`- ${k}`);
  console.error(
    "Mirror the catalog row verbatim from the prod migration that created the key, or drop the grant.",
  );
  process.exit(1);
}

const delegablePattern =
  /UPDATE public\.permission_keys\s+SET is_delegable_to_staff = key = ANY \(ARRAY\[([\s\S]*?)\]::text\[\]\);/;
const seedDelegableBlock = text.match(delegablePattern)?.[1];
const migrationDelegableBlock = migrationText.match(delegablePattern)?.[1];
if (!seedDelegableBlock || !migrationDelegableBlock) {
  console.error(
    `[seed-permissions] could not locate canonical staff delegability in ${SEED} and ${DELEGABILITY_BASE_MIGRATION}`,
  );
  process.exit(1);
}

const parseKeys = (block) =>
  new Set([...block.matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((m) => m[1]));
const seedDelegable = parseKeys(seedDelegableBlock);
const migrationDelegable = parseKeys(migrationDelegableBlock);
for (const forwardText of migrationTexts.slice(1)) {
  for (const match of forwardText.matchAll(
    /UPDATE public\.permission_keys\s+SET is_delegable_to_staff = false\s+WHERE key = '([a-z_]+:[a-z_]+)'/g,
  )) {
    migrationDelegable.delete(match[1]);
  }
  for (const match of forwardText.matchAll(
    /DELETE FROM public\.permission_keys\s+WHERE key IN \(([\s\S]*?)\);/g,
  )) {
    for (const key of parseKeys(match[1])) migrationDelegable.delete(key);
  }
  for (const match of forwardText.matchAll(
    /UPDATE public\.permission_keys\s+SET is_delegable_to_staff = true[\s\S]*?WHERE key = ANY \(ARRAY\[([\s\S]*?)\]::text\[\]\)/g,
  )) {
    for (const key of parseKeys(match[1])) migrationDelegable.add(key);
  }
  for (const match of forwardText.matchAll(
    /UPDATE public\.permission_keys\s+SET is_delegable_to_staff = true[\s\S]*?WHERE key = '([a-z_]+:[a-z_]+)'/g,
  )) {
    migrationDelegable.add(match[1]);
  }
  // Fresh catalog rows inserted already delegable (key, module, label, scope, true).
  for (const match of forwardText.matchAll(
    /\('([a-z_]+:[a-z_]+)',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*true\)/g,
  )) {
    migrationDelegable.add(match[1]);
  }
}
const missingDelegable = [...migrationDelegable]
  .filter((key) => !seedDelegable.has(key))
  .sort();
const extraDelegable = [...seedDelegable]
  .filter((key) => !migrationDelegable.has(key))
  .sort();
const unknownDelegable = [...seedDelegable]
  .filter((key) => !catalog.has(key))
  .sort();

if (
  missingDelegable.length > 0 ||
  extraDelegable.length > 0 ||
  unknownDelegable.length > 0
) {
  console.error(
    `[seed-permissions] staff-delegable permission drift between ${SEED} and the current migration source`,
  );
  for (const key of missingDelegable)
    console.error(`- missing from seed: ${key}`);
  for (const key of extraDelegable) console.error(`- extra in seed: ${key}`);
  for (const key of unknownDelegable)
    console.error(`- missing from catalog: ${key}`);
  process.exit(1);
}

console.log(
  `[seed-permissions] ${granted.size} template-granted keys are catalogued and ${seedDelegable.size} staff-delegable keys match the active migration chain (${SEED}).`,
);

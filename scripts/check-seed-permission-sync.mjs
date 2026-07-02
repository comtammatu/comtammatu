import fs from "node:fs";

// The dev/e2e seed grants role_templates permission keys that
// sync_missing_permissions_from_template() materializes into staff_permissions
// at seed time; staff_permissions FKs to the permission_keys catalog seeded in
// the same file. A key granted in a template but missing from the catalog
// kills every from-empty bring-up (SQLSTATE 23503) while prod keeps working —
// this check fails it in the lint chain instead of in the e2e-smoke job.
const SEED = "supabase/_local-dev/dev-tenant-seed.sql";
const text = fs.readFileSync(SEED, "utf8");

// End each INSERT block at a semicolon that closes a line — descriptions may
// legitimately contain inline semicolons (e.g. "…HĐĐT); manager-gated").
const catalogBlock = text.match(/INSERT INTO public\.permission_keys[\s\S]*?;[ \t]*$/m);
const templateBlock = text.match(/INSERT INTO public\.role_templates[\s\S]*?;[ \t]*$/m);
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

console.log(
  `[seed-permissions] ${granted.size} template-granted keys all present in the ${catalog.size}-key catalog (${SEED}).`,
);

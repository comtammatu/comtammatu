import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const PROD_MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");

const GREENFIELD_ONLY_FILENAMES = new Set([
  "20260602000000_harden_supplier_invoice_source_rls.sql",
  "20260602000100_harden_procurement_source_rls.sql",
  "20260602000200_harden_supplier_return_source_rls.sql",
  "20260602000300_greenfield_schema_hardening.sql",
  "20260602000400_greenfield_internal_table_policy_and_function_path.sql",
  "20260602000500_canonical_position_codes.sql",
  "20260602000600_harden_procurement_catalog_scope.sql",
  "20260602000700_cut_position_role_bridge_runtime.sql",
  "20260602000800_cut_pos_role_bridge_runtime.sql",
  "20260602000900_drop_legacy_role_code_column.sql",
  "20260602001000_drop_redundant_indexes.sql",
]);

const DISALLOWED_MARKERS = [
  { id: "GREENFIELD_ONLY marker", pattern: /\bGREENFIELD_ONLY\b/ },
  { id: "greenfield wording", pattern: /\bgreenfield\b/i },
  { id: "greenfield project ref", pattern: /\bjmasiwuqiyedqvyfzhuq\b/i },
];

function toPosix(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

const failures = [];

if (fs.existsSync(PROD_MIGRATIONS_DIR)) {
  for (const entry of fs.readdirSync(PROD_MIGRATIONS_DIR, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;

    const absolutePath = path.join(PROD_MIGRATIONS_DIR, entry.name);
    const relativePath = toPosix(absolutePath);

    if (GREENFIELD_ONLY_FILENAMES.has(entry.name)) {
      failures.push(
        `${relativePath}: greenfield rehearsal file is in the production migration chain.`,
      );
      continue;
    }

    const content = fs.readFileSync(absolutePath, "utf8");
    const textToScan = `${entry.name}\n${content}`;
    const marker = DISALLOWED_MARKERS.find((check) =>
      check.pattern.test(textToScan),
    );

    if (marker) {
      failures.push(
        `${relativePath}: contains ${marker.id}; keep greenfield rehearsal SQL under supabase/greenfield/migrations/.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Greenfield migration boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "Production-forward migrations belong in supabase/migrations/. Greenfield rehearsal SQL belongs in supabase/greenfield/migrations/.",
  );
  process.exit(1);
}

console.log(
  "Greenfield migration boundary check: production migration chain is clean.",
);

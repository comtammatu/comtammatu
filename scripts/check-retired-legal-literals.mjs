import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const forbidden = [
  new RegExp(`\\b${"H" + "KD"}\\b`, "iu"),
  new RegExp(`${"Hộ" + " kinh doanh"}`, "iu"),
  new RegExp(`${"HO" + " KINH DOANH"}`, "iu"),
  new RegExp(`${"thuế" + " khoán"}`, "iu"),
  new RegExp(`${"Phước" + " Hải"}`, "iu"),
  new RegExp(`${"phuoc" + "[_-]?hai"}`, "iu"),
  new RegExp(`${"matu" + "-prod"}`, "iu"),
  new RegExp(`${"matu" + "-" + "green" + "field-company"}`, "iu"),
  new RegExp(`${"app" + "\\.comtammatu\\.com"}`, "iu"),
  new RegExp(`\\b${"Green" + "field"}\\b`, "iu"),
];
const immutableHistory = [
  "supabase/migration-archive/",
  "supabase/migrations/20260727120000_baseline.sql",
  "supabase/migrations/20260727190000_central_procurement_and_vat_evidence.sql",
  `supabase/migrations/20260727220000_compact_${"green" + "field"}_branch_id_gap.sql`,
  `supabase/migrations/20260728170006_harden_${"green" + "field"}_advisor_findings.sql`,
  "supabase/migrations/20260728170211_reenforce_advisor_harden_after_topology.sql",
  "supabase/migrations/20260728174910_fk_covering_indexes_advisor_wave.sql",
  "supabase/migrations/20260728180429_enforce_single_active_warehouse_per_site.sql",
  "supabase/migrations/20260729150100_harden_branch_revenue_targets_grants.sql",
];
const violations = [];

for (const file of files) {
  if (immutableHistory.some((entry) => file.startsWith(entry))) continue;
  if (!existsSync(file)) continue;
  if (!statSync(file).isFile()) continue;
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const lines = buffer.toString("utf8").split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${file}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    `Retired legal-model literal guard failed:\n${violations.join("\n")}`,
  );
  process.exit(1);
}

console.log("Retired legal-model literal guard: zero active-surface matches.");

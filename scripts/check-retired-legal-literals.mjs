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
];
const immutableHistory = [
  "supabase/migration-archive/",
  "supabase/migrations/20260727120000_baseline.sql",
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

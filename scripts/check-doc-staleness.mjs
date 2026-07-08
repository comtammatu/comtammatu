import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

// Dated docs/plan snapshots and docs/worklog notes are not a durable knowledge
// store. Promote the current contract into the right source-of-truth doc, or
// delete the staging file. Git history is the archive.

const DURABLE = [
  /^docs\/plan\/decisions\.md$/,
  /^docs\/plan\/adr\//,
  /^docs\/worklog\/README\.md$/,
  /(^|\/)README\.md$/i,
];

let files = [];
try {
  files = execSync(
    "git ls-files --cached --others --exclude-standard docs/plan docs/worklog",
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean)
    .filter((p) => existsSync(p))
    .filter((p) => !DURABLE.some((re) => re.test(p)));
} catch {
  console.log("doc-staleness: git ls-files unavailable — skipped.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("doc-staleness: no non-durable plan/worklog snapshots.");
  process.exit(0);
}

console.error(
  `✗ doc-staleness: ${files.length} non-durable plan/worklog snapshot(s) remain. Promote current facts to canonical docs or delete the file:`,
);
for (const p of files) console.error(`    ${p}`);
process.exit(1);

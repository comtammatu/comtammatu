import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

const violations = files.map((path) => ({
  path,
  reason: "non-durable plan/worklog snapshot",
}));

const PERSISTED_SNAPSHOT_MARKERS = [
  ["docs/CODEBASE_MAP.md", "Generated checkout snapshot"],
  ["docs/spec/database-schema.md", "## Current Snapshot"],
];

for (const [path, marker] of PERSISTED_SNAPSHOT_MARKERS) {
  if (existsSync(path) && readFileSync(path, "utf8").includes(marker)) {
    violations.push({ path, reason: `persisted generated marker: ${marker}` });
  }
}

if (violations.length === 0) {
  console.log("doc-staleness: no non-durable or persisted generated snapshots.");
} else {
  console.error(
    `✗ doc-staleness: ${violations.length} stale documentation artifact(s) remain:`,
  );
  for (const violation of violations) {
    console.error(`    ${violation.path}: ${violation.reason}`);
  }
  process.exitCode = 1;
}

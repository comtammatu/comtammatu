import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Advisory guard: point-in-time snapshot docs (docs/plan/* audits/remediations,
// docs/worklog/*) must declare the commit they were last reconciled against, so
// a finding fixed by a later PR can't keep reading as live and mislead the next
// agent. See docs/agent/rules/references.md -> "Transient Snapshot Docs".
// DOC_STALENESS_STRICT=1 promotes warn -> fail-closed.

const STRICT = process.env.DOC_STALENESS_STRICT === "1";
const BANNER = /reconciled-through/i;
const HEAD_LINES = 15;

// self-check (always on): the detector must accept a bannered head and reject a
// bare one. Fails loud if the regex is ever broken.
if (
  !BANNER.test("> Reconciled-through abc123") ||
  BANNER.test("> snapshot only")
) {
  throw new Error("check-doc-staleness: BANNER self-check failed");
}

// Durable docs living under the snapshot zones — never require a banner.
const DURABLE = [
  /^docs\/plan\/decisions\.md$/,
  /^docs\/plan\/adr\//,
  /(^|\/)README\.md$/i,
];

let files = [];
try {
  files = execSync(
    "git ls-files --cached --others --exclude-standard docs/plan docs/worklog",
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 },
  )
    .split("\n")
    .filter((p) => p.endsWith(".md") && !DURABLE.some((re) => re.test(p)));
} catch {
  console.log("doc-staleness: git ls-files unavailable — skipped (advisory).");
  process.exit(0);
}

const missing = [];
for (const p of files) {
  let head = "";
  try {
    head = readFileSync(p, "utf8").split("\n").slice(0, HEAD_LINES).join("\n");
  } catch {
    continue;
  }
  if (!BANNER.test(head)) missing.push(p);
}

if (missing.length === 0) {
  console.log(
    `doc-staleness: ${files.length} snapshot doc(s) carry a Reconciled-through banner.`,
  );
  process.exit(0);
}

const log = STRICT ? console.error : console.log;
log(
  `${STRICT ? "✗" : "⚠"} doc-staleness: ${missing.length} snapshot doc(s) missing a "Reconciled-through <sha>" banner — findings may be stale, verify vs git before trusting:`,
);
for (const p of missing) log(`    ${p}`);
log(
  `  Fix: add the banner (or retire the doc) per docs/agent/rules/references.md -> "Transient Snapshot Docs".`,
);
process.exit(STRICT ? 1 : 0);

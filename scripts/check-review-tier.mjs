import { execSync } from "node:child_process";

// Deterministic review-tier FLOOR guard for docs/agent/rules/workflow.md. It
// classifies the PR diff vs the base branch by blast radius and flags a missing
// or under-floor declaration, including governance policy changes. Advisory
// locally; REVIEW_TIER_STRICT=1 promotes it to fail-closed.
// Never blocks when the base ref is unreachable.

const STRICT = process.env.REVIEW_TIER_STRICT === "1";

function git(args) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function softPass(msg) {
  console.log(`Review-tier guard: ${msg}`);
  process.exit(0);
}

let base = "";
for (const ref of ["main", "origin/main"]) {
  try {
    base = git(`merge-base HEAD ${ref}`);
    if (base) break;
  } catch {
    /* try next ref */
  }
}
if (!base) softPass("base ref unreachable — skipped (advisory).");

let changed = [];
try {
  changed = git(`diff --name-only ${base}`).split("\n").filter(Boolean);
} catch {
  softPass("could not compute diff — skipped (advisory).");
}
if (changed.length === 0) softPass("no changes vs base — nothing to classify.");

const DOC_OR_LOCK = (p) =>
  p.endsWith(".md") ||
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(p);

const T3_GOVERNANCE = new Set([
  "AGENTS.md",
  "docs/agent/rules/engineering.md",
  "docs/agent/rules/database.md",
  "docs/agent/rules/workflow.md",
  "scripts/guard-prod-db.mjs",
  "scripts/check-guard-sync.mjs",
  "scripts/check-review-tier.mjs",
  "scripts/check-rules-mirror.mjs",
  ".github/workflows/ci.yml",
  ".claude/settings.json",
  ".codex/hooks.json",
  ".codex/config.toml",
]);
const T2_GOVERNANCE = (p) =>
  p.startsWith("docs/agent/rules/") ||
  p === "docs/spec/toast-notification-system.md";
const governanceT3 = changed.filter((p) => T3_GOVERNANCE.has(p));
const governanceT2 = changed.filter(
  (p) => T2_GOVERNANCE(p) && !T3_GOVERNANCE.has(p),
);

if (
  changed.every(DOC_OR_LOCK) &&
  governanceT2.length === 0 &&
  governanceT3.length === 0
)
  softPass("doc/lockfile-only diff — T1 eligible, no tier floor.");

const MONEY = /(^|\/)(finance|payments?|invoice|hddt|payroll|refund|journal)/i;
const AUTH_RLS = [
  /^packages\/shared\/src\/auth\//,
  /^apps\/web\/app\/_lib\/auth\.ts$/,
  /^apps\/web\/app\/_lib\/permissions\.ts$/,
  /^apps\/web\/proxy\.ts$/,
  /(^|\/)(rls|policy|policies)/i,
];

const hits = {
  migration: [],
  money: [],
  "auth/RLS": [],
  "T3 governance": governanceT3,
};
for (const p of changed) {
  if (p.startsWith("supabase/migrations/")) hits.migration.push(p);
  if (MONEY.test(p)) hits.money.push(p);
  if (AUTH_RLS.some((re) => re.test(p))) hits["auth/RLS"].push(p);
}

let securityDefiner = false;
try {
  // Track the current file via +++ headers so the definer token in .md prose
  // (rule docs describing the trigger) does not trip the floor. The \s+ form
  // also keeps this script's own source from matching itself in a diff.
  const DEFINER_TOKEN = /SECURITY\s+DEFINER/i;
  let inMd = false;
  for (const l of git(`diff ${base}`).split("\n")) {
    if (l.startsWith("+++ ")) {
      inMd = l.endsWith(".md");
      continue;
    }
    if (inMd || !l.startsWith("+")) continue;
    if (DEFINER_TOKEN.test(l)) {
      securityDefiner = true;
      break;
    }
  }
} catch {
  /* diff body optional — path signals already gathered */
}

const reasonParts = [];
for (const [cat, paths] of Object.entries(hits)) {
  if (paths.length === 0) continue;
  const ex = paths.slice(0, 3).join(", ");
  reasonParts.push(
    `${cat} ×${paths.length} (${ex}${paths.length > 3 ? ", …" : ""})`,
  );
}
if (securityDefiner) reasonParts.push("added SECURITY DEFINER");

if (governanceT2.length > 0) {
  const ex = governanceT2.slice(0, 3).join(", ");
  reasonParts.push(
    `T2 governance ×${governanceT2.length} (${ex}${governanceT2.length > 3 ? ", …" : ""})`,
  );
}

const reasonStr = reasonParts.join("; ");
const hasT3Signal =
  Object.values(hits).some((paths) => paths.length > 0) || securityDefiner;
const floor = hasT3Signal ? 3 : 2;
const name = (n) => `T${n}`;

let declared = null;
try {
  // Scan every commit body in the PR range, not just HEAD: on a pull_request
  // event the checked-out ref is an auto-generated merge commit whose message
  // carries no tier note, so `log -1` would miss the author's note and fail
  // strict mode spuriously. base..HEAD covers the real PR commits.
  const hay = `${process.env.REVIEW_TIER || ""}\n${git(`log ${base}..HEAD --format=%B`)}`;
  if (/\bT3\b/.test(hay)) declared = 3;
  else if (/\bT2\b/.test(hay)) declared = 2;
  else if (/\bT1\b/.test(hay)) declared = 1;
} catch {
  /* no commit body available */
}

if (declared === null) {
  const msg = `floor ${name(floor)} (${reasonStr || "behavior change"}), but no T1/T2/T3 note found in the PR commit range.`;
  if (STRICT) {
    console.error(`Review-tier guard FAILED: ${msg}`);
    process.exit(1);
  }
  softPass(`${msg} [advisory]`);
}

if (declared < floor) {
  const msg = `declared ${name(declared)} but blast radius floors at ${name(floor)} — ${reasonStr}. Re-justify or raise the tier.`;
  if (STRICT) {
    console.error(`Review-tier guard FAILED: ${msg}`);
    process.exit(1);
  }
  console.warn(`Review-tier guard WARNING: ${msg}`);
  process.exit(0);
}

console.log(
  `Review-tier guard: declared ${name(declared)} >= floor ${name(floor)}. OK.`,
);

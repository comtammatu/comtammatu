import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Deterministic review-tier floor guard for docs/agent/rules/workflow.md.
// GitHub event payloads own CI ranges; local runs include the dirty tree and
// remain advisory. Strict mode fails closed when its event, refs, diff, or log
// cannot be read.

const STRICT = process.env.REVIEW_TIER_STRICT === "1";
const MAX_BUFFER = 64 * 1024 * 1024;

const T3_GOVERNANCE = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agent/rules/engineering.md",
  "docs/agent/rules/database.md",
  "docs/agent/rules/workflow.md",
  "scripts/guard-prod-db.mjs",
  "scripts/check-guard-sync.mjs",
  "scripts/check-review-tier.mjs",
  "scripts/check-doc-staleness.mjs",
  "scripts/check-rules-mirror.mjs",
  ".github/workflows/ci.yml",
  ".claude/settings.json",
  ".codex/hooks.json",
  ".codex/config.toml",
  "docs/ref/business-context.md",
  "docs/ref/einvoice-tax.md",
  "docs/ref/labor-contracts.md",
  "docs/ref/legal-framework-2026.md",
  "docs/ref/payroll-pit.md",
]);
const T3_GUARD_SCRIPTS = new Set([
  "scripts/check-baseline-hygiene.mjs",
  "scripts/check-client-storage.mjs",
  "scripts/check-doc-staleness.mjs",
  "scripts/check-guard-sync.mjs",
  "scripts/check-i18n-baseline-monotonic.mjs",
  "scripts/check-migration-lineage.mjs",
  "scripts/check-regression-guards.mjs",
  "scripts/check-review-tier.mjs",
  "scripts/check-rules-mirror.mjs",
  "scripts/check-seed-permission-sync.mjs",
  "scripts/check-ui-contract.mjs",
  "scripts/deps-audit.mjs",
  "scripts/gen-role-route-matrix.mjs",
  "scripts/lint-copy.mjs",
]);

const T2_GOVERNANCE = (path) =>
  path === "docs/CODEBASE_MAP.md" ||
  [
    "docs/agent/rules/",
    "docs/architecture/",
    "docs/modules/",
    "docs/ref/",
    "docs/spec/",
  ].some((prefix) => path.startsWith(prefix));
const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/;
const MONEY =
  /(^|\/)(finance|payments?|invoice|hddt|payroll|refund|journal|sepay|vietqr|vnpay|momo|stripe)/i;
const AUTH_RLS = [
  /^packages\/shared\/src\/auth\//,
  /^apps\/web\/app\/_lib\/auth\.ts$/,
  /^apps\/web\/app\/_lib\/permissions\.ts$/,
  /^apps\/web\/proxy\.ts$/,
  /(^|\/)auth(?:entication)?(?:\/|\.|-)/i,
  /(^|\/)permissions?(?:\/|\.|-)/i,
  /(^|\/)(rls|policy|policies)/i,
];
const PACKAGE_GUARD_WIRING =
  /"(?:lint(?::[^"]*)?|verify)"\s*:|check-(?:review-tier|guard-sync|rules-mirror|migration-lineage|doc-staleness)|guard-prod-db/;
const SECURITY_DEFINER = /SECURITY\s+DEFINER/i;

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function oneLine(value) {
  return String(value).trim();
}

function requireSha(label, value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`${label} is missing or is not a full Git SHA`);
  }
  return value;
}

function verifyCommit(run, label, sha) {
  try {
    run(["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    throw new Error(`${label} ${sha} is not available as a commit`);
  }
}

function resolveRange({ strict, eventName, event, run = runGit }) {
  if (strict) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("GitHub event payload is missing or malformed");
    }

    if (eventName === "pull_request") {
      const baseSha = requireSha(
        "pull_request.base.sha",
        event.pull_request?.base?.sha,
      );
      const headSha = requireSha(
        "pull_request.head.sha",
        event.pull_request?.head?.sha,
      );
      verifyCommit(run, "pull request base", baseSha);
      verifyCommit(run, "pull request head", headSha);
      const base = requireSha(
        "pull request merge-base",
        oneLine(run(["merge-base", baseSha, headSha])),
      );
      verifyCommit(run, "pull request merge-base", base);
      return {
        base,
        end: headSha,
        includeWorktree: false,
        logBase: base,
        label: "pull_request base...head",
      };
    }

    if (eventName === "push") {
      const before = requireSha("push.before", event.before);
      const after = requireSha("push.after", event.after);
      verifyCommit(run, "push before", before);
      verifyCommit(run, "push after", after);
      return {
        base: before,
        end: after,
        includeWorktree: false,
        logBase: before,
        label: "push before..after",
      };
    }

    throw new Error(
      `unsupported strict GitHub event: ${eventName || "<empty>"}`,
    );
  }

  for (const ref of ["origin/main", "main"]) {
    try {
      const base = requireSha(
        `merge-base HEAD ${ref}`,
        oneLine(run(["merge-base", "HEAD", ref])),
      );
      return {
        base,
        end: "HEAD",
        includeWorktree: true,
        logBase: base,
        label: `local ${ref} merge-base plus working tree`,
      };
    } catch {
      // Try the next local base. Local mode is advisory by contract.
    }
  }
  throw new Error("local base ref is unreachable");
}

function revisionArgs(range) {
  return range.includeWorktree ? [range.base] : [range.base, range.end];
}

function parseNameStatus(raw) {
  const fields = raw.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const entries = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) throw new Error("empty status in git diff --name-status");
    if (/^[RC]/.test(status)) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) {
        throw new Error(`missing rename/copy path for status ${status}`);
      }
      entries.push({ status, oldPath, newPath });
      continue;
    }
    const path = fields[index++];
    if (!path) throw new Error(`missing path for status ${status}`);
    entries.push({ status, path });
  }
  return entries;
}

function entryPaths(entry) {
  return entry.oldPath ? [entry.oldPath, entry.newPath] : [entry.path];
}

function changedPaths(entries) {
  return [...new Set(entries.flatMap(entryPaths))];
}

function parseNumstat(raw) {
  let additions = 0;
  let deletions = 0;
  let binary = false;
  for (const field of raw.split("\0")) {
    const match = field.match(/^([^\t]+)\t([^\t]+)\t/);
    if (!match) continue;
    if (match[1] === "-" || match[2] === "-") {
      binary = true;
      continue;
    }
    additions += Number(match[1]);
    deletions += Number(match[2]);
  }
  return { additions, deletions, binary };
}

function changedDiffLines(diff) {
  return diff
    .split("\n")
    .filter(
      (line) =>
        /^[+-]/.test(line) &&
        !line.startsWith("+++") &&
        !line.startsWith("---"),
    );
}

function changedContent(diff) {
  return changedDiffLines(diff)
    .map((line) => line.slice(1))
    .join("\n");
}

function securityDefinerChanged(diff) {
  for (const hunk of String(diff).split(/^@@/m).slice(1)) {
    const before = [];
    const after = [];
    for (const line of hunk.split("\n")) {
      if (line.startsWith(" ")) {
        before.push(line.slice(1));
        after.push(line.slice(1));
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        before.push(line.slice(1));
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        after.push(line.slice(1));
      }
    }
    const beforeCount =
      before.join("\n").match(/SECURITY\s+DEFINER/gi)?.length ?? 0;
    const afterCount =
      after.join("\n").match(/SECURITY\s+DEFINER/gi)?.length ?? 0;
    if (beforeCount !== afterCount) return true;
  }
  return false;
}

function securityDefinerTouched(diff) {
  return (
    SECURITY_DEFINER.test(changedContent(diff)) || securityDefinerChanged(diff)
  );
}

function highestDeclaredTier(text) {
  let highest = null;
  for (const match of String(text).matchAll(/\bT([123])\b/g)) {
    highest = Math.max(highest ?? 0, Number(match[1]));
  }
  return highest;
}

function classify({
  entries,
  lineStats,
  securityDefinerPaths = [],
  packageGuardChanged = false,
}) {
  const paths = changedPaths(entries);
  const allModified = entries.every((entry) => entry.status === "M");
  const governanceT3 = paths.filter(
    (path) => T3_GOVERNANCE.has(path) || T3_GUARD_SCRIPTS.has(path),
  );
  const governanceT2 = paths.filter(
    (path) => T2_GOVERNANCE(path) && !T3_GOVERNANCE.has(path),
  );
  const hits = {
    migration: paths.filter((path) => path.startsWith("supabase/migrations/")),
    money: paths.filter((path) => MONEY.test(path)),
    "auth/RLS": paths.filter((path) =>
      AUTH_RLS.some((regex) => regex.test(path)),
    ),
    "T3 governance": governanceT3,
  };
  const hasT3 =
    Object.values(hits).some((matched) => matched.length > 0) ||
    securityDefinerPaths.length > 0 ||
    packageGuardChanged;

  const onlyMarkdown =
    paths.length > 0 && paths.every((path) => path.endsWith(".md"));
  const onlyLockfile =
    paths.length > 0 && paths.every((path) => LOCKFILE.test(path));
  if (
    allModified &&
    governanceT3.length === 0 &&
    governanceT2.length === 0 &&
    !hasT3 &&
    ((onlyMarkdown &&
      !lineStats.binary &&
      lineStats.additions + lineStats.deletions <= 2) ||
      onlyLockfile)
  ) {
    return {
      floor: 1,
      reasons: [
        onlyLockfile
          ? "modified lockfile only"
          : "modified Markdown under three lines",
      ],
    };
  }

  const reasons = [];
  for (const [category, matched] of Object.entries(hits)) {
    if (matched.length === 0) continue;
    const examples = matched.slice(0, 3).join(", ");
    reasons.push(
      `${category} ×${matched.length} (${examples}${matched.length > 3 ? ", …" : ""})`,
    );
  }
  if (securityDefinerPaths.length > 0) {
    reasons.push(
      `changed SECURITY DEFINER ×${securityDefinerPaths.length} (${securityDefinerPaths.slice(0, 3).join(", ")})`,
    );
  }
  if (packageGuardChanged) reasons.push("package.json guard wiring changed");
  if (governanceT2.length > 0) {
    reasons.push(
      `T2 governance ×${governanceT2.length} (${governanceT2.slice(0, 3).join(", ")})`,
    );
  }

  return {
    floor: hasT3 ? 3 : 2,
    reasons:
      reasons.length > 0 ? reasons : ["behavior or non-editorial change"],
  };
}

function loadStrictEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath)
    throw new Error("GITHUB_EVENT_PATH is required in strict mode");
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot read GITHUB_EVENT_PATH: ${error.message}`);
  }
}

function collectDiff(range) {
  const revisions = revisionArgs(range);
  const entries = parseNameStatus(
    runGit([
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      ...revisions,
      "--",
    ]),
  );

  if (range.includeWorktree) {
    const tracked = new Set(changedPaths(entries));
    const untracked = runGit([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ])
      .split("\0")
      .filter(Boolean);
    for (const path of untracked) {
      if (!tracked.has(path))
        entries.push({ status: "A", path, untracked: true });
    }
  }

  const lineStats = parseNumstat(
    runGit(["diff", "--numstat", "-z", ...revisions, "--"]),
  );
  const untrackedEntries = entries.filter((entry) => entry.untracked);
  for (const entry of untrackedEntries) {
    const content = readFileSync(entry.path, "utf8");
    lineStats.additions += content === "" ? 0 : content.split("\n").length;
  }

  const securityPaths = [];
  const nonMarkdownPaths = changedPaths(entries).filter(
    (path) => !path.endsWith(".md"),
  );
  const chunks = [];
  for (let index = 0; index < nonMarkdownPaths.length; index += 100) {
    chunks.push(nonMarkdownPaths.slice(index, index + 100));
  }
  for (const chunk of chunks) {
    const chunkDiff = runGit([
      "diff",
      "--unified=1",
      "--no-ext-diff",
      "--no-color",
      ...revisions,
      "--",
      ...chunk,
    ]);
    if (!securityDefinerTouched(chunkDiff)) continue;
    for (const path of chunk) {
      const pathDiff = runGit([
        "diff",
        "--unified=1",
        "--no-ext-diff",
        "--no-color",
        ...revisions,
        "--",
        path,
      ]);
      if (securityDefinerTouched(pathDiff)) {
        securityPaths.push(path);
      }
    }
  }
  for (const entry of untrackedEntries) {
    if (
      !entry.path.endsWith(".md") &&
      SECURITY_DEFINER.test(readFileSync(entry.path, "utf8"))
    ) {
      securityPaths.push(entry.path);
    }
  }

  let packageGuardChanged = false;
  if (changedPaths(entries).includes("package.json")) {
    const packageDiff = runGit([
      "diff",
      "--unified=0",
      "--no-ext-diff",
      "--no-color",
      ...revisions,
      "--",
      "package.json",
    ]);
    packageGuardChanged = changedDiffLines(packageDiff).some((line) =>
      PACKAGE_GUARD_WIRING.test(line),
    );
  }

  return {
    entries,
    lineStats,
    securityDefinerPaths: [...new Set(securityPaths)],
    packageGuardChanged,
  };
}

function outputFailure(message) {
  if (STRICT) {
    console.error(`Review-tier guard FAILED: ${message}`);
    process.exit(1);
  }
  console.warn(`Review-tier guard WARNING: ${message} [local advisory]`);
  process.exit(0);
}

function main() {
  let range;
  let diff;
  try {
    const event = STRICT ? loadStrictEvent() : null;
    range = resolveRange({
      strict: STRICT,
      eventName: process.env.GITHUB_EVENT_NAME,
      event,
    });
    diff = collectDiff(range);
  } catch (error) {
    outputFailure(error.message);
  }

  if (diff.entries.length === 0) {
    console.log(`Review-tier guard: no changes in ${range.label}.`);
    return;
  }

  let commitMessages = "";
  try {
    commitMessages = runGit([
      "log",
      `${range.logBase}..${range.end}`,
      "--format=%B",
    ]);
  } catch (error) {
    if (STRICT)
      outputFailure(`cannot read review declarations: ${error.message}`);
    console.warn(
      "Review-tier guard: commit declarations unavailable [local advisory].",
    );
  }

  const result = classify(diff);
  const declared = highestDeclaredTier(
    `${process.env.REVIEW_TIER || ""}\n${commitMessages}`,
  );
  const reason = result.reasons.join("; ");

  if (declared === null) {
    outputFailure(
      `floor T${result.floor} (${reason}), but no T1/T2/T3 declaration was found in ${range.label}.`,
    );
  }
  if (declared < result.floor) {
    outputFailure(
      `declared T${declared}, but ${range.label} floors at T${result.floor}: ${reason}.`,
    );
  }

  console.log(
    `Review-tier guard: declared T${declared} >= floor T${result.floor} (${reason}). OK.`,
  );
}

function runSelfTest() {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const fakeRun = (args) => {
    if (args[0] === "cat-file") return "";
    if (args[0] === "merge-base") return `${C}\n`;
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  assert.deepEqual(
    resolveRange({
      strict: true,
      eventName: "pull_request",
      event: { pull_request: { base: { sha: A }, head: { sha: B } } },
      run: fakeRun,
    }),
    {
      base: C,
      end: B,
      includeWorktree: false,
      logBase: C,
      label: "pull_request base...head",
    },
  );
  assert.deepEqual(
    resolveRange({
      strict: true,
      eventName: "push",
      event: { before: A, after: B },
      run: fakeRun,
    }),
    {
      base: A,
      end: B,
      includeWorktree: false,
      logBase: A,
      label: "push before..after",
    },
  );
  assert.throws(
    () =>
      resolveRange({
        strict: true,
        eventName: "pull_request",
        event: null,
        run: fakeRun,
      }),
    /payload is missing/,
  );

  let localAttempt = 0;
  const local = resolveRange({
    strict: false,
    run: (args) => {
      localAttempt += 1;
      if (args.at(-1) === "origin/main") throw new Error("missing");
      return `${A}\n`;
    },
  });
  assert.equal(localAttempt, 2);
  assert.equal(local.base, A);
  assert.equal(local.includeWorktree, true);

  const fixture = (path, options = {}) =>
    classify({
      entries: [options.entry ?? { status: options.status ?? "M", path }],
      lineStats: {
        additions: options.additions ?? 1,
        deletions: options.deletions ?? 1,
        binary: false,
      },
      securityDefinerPaths: options.securityDefinerPaths ?? [],
      packageGuardChanged: options.packageGuardChanged ?? false,
    }).floor;

  assert.equal(fixture("CLAUDE.md"), 3);
  assert.equal(fixture("package.json", { packageGuardChanged: true }), 3);
  assert.equal(fixture("package.json"), 2);
  assert.equal(
    fixture("ignored", {
      entry: {
        status: "R100",
        oldPath: "src/original.ts",
        newPath: "packages/shared/src/auth/original.ts",
      },
    }),
    3,
  );
  assert.equal(
    fixture("src/rpc.sql", { securityDefinerPaths: ["src/rpc.sql"] }),
    3,
  );
  assert.equal(
    fixture("src/removed.sql", {
      securityDefinerPaths: ["src/removed.sql"],
      deletions: 1,
    }),
    3,
  );
  assert.equal(fixture("README.md", { additions: 1, deletions: 1 }), 1);
  assert.equal(fixture("README.md", { additions: 2, deletions: 1 }), 2);
  assert.equal(
    fixture("README.md", { status: "A", additions: 1, deletions: 0 }),
    2,
  );
  assert.equal(
    fixture("docs/modules/finance.md", { additions: 1, deletions: 0 }),
    3,
  );
  assert.equal(fixture("apps/web/app/api/webhooks/sepay/route.ts"), 3);
  assert.equal(
    fixture("docs/modules/auth.md", { additions: 1, deletions: 0 }),
    3,
  );
  assert.equal(
    fixture("docs/spec/design-system.md", { additions: 1, deletions: 0 }),
    2,
  );
  assert.equal(
    fixture("apps/web/app/(protected)/hr/staff/1/permissions/actions.ts"),
    3,
  );
  assert.equal(fixture("pnpm-lock.yaml"), 1);
  assert.equal(fixture("supabase/migrations/old.sql", { status: "D" }), 3);
  assert.equal(highestDeclaredTier("T1\nT3\nT2"), 3);
  assert.equal(highestDeclaredTier("tier two"), null);
  assert.deepEqual(parseNameStatus("D\0old.sql\0R100\0old.ts\0new.ts\0"), [
    { status: "D", path: "old.sql" },
    { status: "R100", oldPath: "old.ts", newPath: "new.ts" },
  ]);
  assert.equal(
    SECURITY_DEFINER.test(changedContent("+security\n+ definer\n")),
    true,
  );
  assert.equal(
    PACKAGE_GUARD_WIRING.test('+    "lint:seed-permissions": "true"'),
    true,
  );
  assert.equal(
    securityDefinerChanged("@@ -1,2 +1,2 @@\n SECURITY\n-INVOKER\n+DEFINER\n"),
    true,
  );
  assert.equal(
    securityDefinerTouched(
      "@@ -1,2 +1,2 @@\n-a() SECURITY DEFINER\n+a() SECURITY INVOKER\n-b() SECURITY INVOKER\n+b() SECURITY DEFINER\n",
    ),
    true,
  );
  assert.equal(fixture("docs/ref/legal-framework-2026.md"), 3);
  assert.equal(fixture("docs/ref/operational-data-contract.md"), 2);
  assert.equal(fixture("docs/ref/inventory.md"), 2);
  assert.equal(fixture("scripts/check-baseline-hygiene.mjs"), 3);

  console.log("Review-tier guard self-test: fixtures passed.");
}

if (process.argv.includes("--self-test")) runSelfTest();
else main();

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Dated docs/plan snapshots and docs/worklog notes are not a durable knowledge
// store. Promote current contracts to their owning docs, and keep the active
// tracker free of shipped history. Git is the archive.

const DURABLE = [
  /^docs\/plan\/decisions\.md$/,
  // Owner-mandated Design System authorities remain exact-path exceptions.
  /^docs\/plan\/design-system-baseline-decision\.md$/,
  /^docs\/plan\/design-system-rollout\.md$/,
  /^docs\/plan\/adr\//,
  /^docs\/worklog\/README\.md$/,
  /(^|\/)README\.md$/i,
];
const PERSISTED_SNAPSHOT_MARKERS = [
  ["docs/CODEBASE_MAP.md", "Generated checkout snapshot"],
  ["docs/spec/database-schema.md", "## Current Snapshot"],
];
const TASK_PATH = "tasks/todo.md";
const DECISION_PATH = "docs/plan/decisions.md";
const TASK_FIELDS = ["State", "Kind", "Tier", "Lane", "Exit", "Evidence"];
const TASK_STATES = new Set(["triage", "ready", "doing", "verify", "blocked"]);
const TASK_KINDS = new Set([
  "product",
  "feature",
  "defect",
  "qa",
  "debt",
  "maintenance",
  "release",
]);

function isDurablePath(path) {
  return DURABLE.some((regex) => regex.test(path));
}

function taskFieldValues(body, field) {
  return [...body.matchAll(new RegExp(`^${field}:\\s*(.+)$`, "gm"))].map(
    (match) => match[1].trim(),
  );
}

function validateTaskDoc(taskDoc) {
  const reasons = [];
  const headings = [...taskDoc.matchAll(/^## (.+)$/gm)];
  const preambleEnd = headings[0]?.index ?? taskDoc.length;
  const preamble = taskDoc.slice(0, preambleEnd);
  if (
    /^(?:State|Kind|Tier|Lane|Exit|Evidence|Blocker):/m.test(preamble) ||
    /^\s*- \[[ xX]\]/m.test(preamble)
  ) {
    reasons.push("task fields and actions must live under an H2 outcome");
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = heading[1].trim();
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = headings[index + 1]?.index ?? taskDoc.length;
    const body = taskDoc.slice(bodyStart, bodyEnd);

    for (const field of TASK_FIELDS) {
      if (taskFieldValues(body, field).length !== 1) {
        reasons.push(`"${title}" must contain exactly one ${field} field`);
      }
    }

    const state = taskFieldValues(body, "State")[0];
    const kind = taskFieldValues(body, "Kind")[0];
    const tier = taskFieldValues(body, "Tier")[0];
    const lane = taskFieldValues(body, "Lane")[0];
    const blocker = taskFieldValues(body, "Blocker");

    if (state && !TASK_STATES.has(state)) {
      reasons.push(`"${title}" has invalid State: ${state}`);
    }
    if (kind && !TASK_KINDS.has(kind)) {
      reasons.push(`"${title}" has invalid Kind: ${kind}`);
    }
    if (tier && !/^T[123]$/.test(tier)) {
      reasons.push(`"${title}" has invalid Tier: ${tier}`);
    }
    if (lane && !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(lane)) {
      reasons.push(`"${title}" has invalid Lane: ${lane}`);
    }
    if (
      state === "blocked" &&
      (blocker.length !== 1 || !/\brecheck\b/i.test(blocker[0]))
    ) {
      reasons.push(`"${title}" needs one Blocker with a recheck trigger`);
    }
    if (state !== "blocked" && blocker.length > 0) {
      reasons.push(`"${title}" may use Blocker only in blocked state`);
    }
    if (!/^- \[ \] \S/m.test(body)) {
      reasons.push(`"${title}" must contain at least one unchecked action`);
    }
    if (/^\s*- \[[xX]\]/m.test(body)) {
      reasons.push(`"${title}" persists checked history; delete passed work`);
    }
  }

  if (/^Status:/im.test(taskDoc)) {
    reasons.push("Status is not a task field; use the State lifecycle");
  }
  if (/^### (?:T[23] review|UI Advisor Gate)\s*$/im.test(taskDoc)) {
    reasons.push("review transcripts belong in the task or PR conversation");
  }
  return reasons;
}

function validateDecisionDoc(decisionDoc) {
  const reasons = [];
  if (
    /^<!--\s*DRAFT\b/m.test(decisionDoc) ||
    /^## D\d+:.*(?:\((?:DRAFT|NHÁP)\)|\[(?:DRAFT|NHÁP)\])/m.test(decisionDoc)
  ) {
    reasons.push("draft decisions belong in a Parked ADR");
  }
  if (/^\*\*(?:Status|Trạng thái):\*\*/m.test(decisionDoc)) {
    reasons.push("decision status belongs in an ADR, not decisions.md");
  }
  return reasons;
}

function collectViolations() {
  const violations = [];
  let files;
  try {
    files = execFileSync(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "docs/plan",
        "docs/worklog",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024 * 1024,
      },
    )
      .split("\n")
      .filter(Boolean)
      .filter((path) => existsSync(path))
      .filter((path) => !isDurablePath(path));
  } catch {
    return [{ path: "git", reason: "git ls-files unavailable" }];
  }

  for (const path of files) {
    violations.push({ path, reason: "non-durable plan/worklog snapshot" });
  }
  for (const [path, marker] of PERSISTED_SNAPSHOT_MARKERS) {
    if (existsSync(path) && readFileSync(path, "utf8").includes(marker)) {
      violations.push({
        path,
        reason: `persisted generated marker: ${marker}`,
      });
    }
  }

  if (!existsSync(TASK_PATH)) {
    violations.push({
      path: TASK_PATH,
      reason: "active task tracker is missing",
    });
  } else {
    for (const reason of validateTaskDoc(readFileSync(TASK_PATH, "utf8"))) {
      violations.push({ path: TASK_PATH, reason });
    }
  }
  if (existsSync(DECISION_PATH)) {
    for (const reason of validateDecisionDoc(
      readFileSync(DECISION_PATH, "utf8"),
    )) {
      violations.push({ path: DECISION_PATH, reason });
    }
  }
  return violations;
}

function runSelfTest() {
  const valid = `# Current Tasks

## Outcome

State: blocked
Kind: qa
Tier: T3
Lane: finance/payments
Exit: Observable result.
Evidence: Repeatable proof.
Blocker: External dependency. Recheck after it changes.

- [ ] Run the proof.
`;
  assert.deepEqual(validateTaskDoc(valid), []);
  assert.deepEqual(validateTaskDoc("# Current Tasks\n"), []);
  assert.ok(
    validateTaskDoc("# Current Tasks\nState: ready\n- [ ] Orphan\n").some(
      (reason) => /under an H2/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(`State: ready\n- [ ] Orphan\n${valid}`).some((reason) =>
      /under an H2/.test(reason),
    ),
  );
  assert.match(
    validateTaskDoc(valid.replace("State: blocked\n", ""))[0],
    /State/,
  );
  assert.ok(
    validateTaskDoc(valid.replace("- [ ] Run", "- [x] Run")).some((reason) =>
      /checked history/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(valid.replace(" Recheck after it changes.", "")).some(
      (reason) => /recheck trigger/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(valid.replace("State: blocked", "State: done")).some(
      (reason) => /invalid State/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(`${valid}\nStatus: superseded\n`).some((reason) =>
      /Status is not/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(`${valid}\n### T3 review\n\n- PM: transcript\n`).some(
      (reason) => /review transcripts/.test(reason),
    ),
  );
  assert.deepEqual(
    validateDecisionDoc("## D001: Accepted\n\n**Decision:** Keep it.\n"),
    [],
  );
  assert.ok(
    validateDecisionDoc("## D001: Option (NHÁP)\n").some((reason) =>
      /Parked ADR/.test(reason),
    ),
  );
  assert.ok(
    validateDecisionDoc("## D001: Option\n\n**Status:** Draft\n").some(
      (reason) => /not decisions\.md/.test(reason),
    ),
  );
  assert.equal(isDurablePath("docs/plan/design-system-rollout.md"), true);
  assert.equal(
    isDurablePath("docs/plan/design-system-baseline-decision.md"),
    true,
  );
  assert.equal(
    isDurablePath(["docs", "plan", "another-rollout.md"].join("/")),
    false,
  );
  console.log("doc-staleness self-test: 16 lifecycle fixtures passed.");
}

function main() {
  const violations = collectViolations();
  if (violations.length === 0) {
    console.log(
      "doc-staleness: durable docs and active task lifecycle are clean.",
    );
    return;
  }
  console.error(
    `✗ doc-staleness: ${violations.length} stale documentation artifact(s) remain:`,
  );
  for (const violation of violations) {
    console.error(`    ${violation.path}: ${violation.reason}`);
  }
  process.exitCode = 1;
}

if (process.argv.includes("--self-test")) runSelfTest();
else main();

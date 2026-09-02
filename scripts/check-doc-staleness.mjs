import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const DURABLE = [
  /^docs\/plan\/decisions\.md$/,
  /^docs\/plan\/adr\//,
  /^docs\/plan\/branch-operations-chrome-rebuild\.md$/,
  /(^|\/)README\.md$/i,
];
const SNAPSHOT_MARKERS = [
  ["docs/CODEBASE_MAP.md", "Generated checkout snapshot"],
  ["docs/spec/database-schema.md", "## Current Snapshot"],
];
const TASK_PATH = "tasks/todo.md";
const DECISION_PATH = "docs/plan/decisions.md";
const ARCHITECTURE_PATH = "docs/spec/architecture.md";
const ARCHITECTURE_FORBIDDEN_HEADINGS = [
  "Code Placement",
  "Import Boundaries",
  "Routing (path-based, single domain)",
];
const ARCHITECTURE_REQUIRED_POINTERS = [
  "docs/CODEBASE_MAP.md#project-placement-matrix",
  "docs/agent/rules/engineering.md",
  "docs/spec/role-route-matrix.md",
];
const REQUIRED_TASK_FIELDS = ["State", "Exit", "Evidence"];
const TASK_STATES = new Set(["triage", "ready", "doing", "verify", "blocked"]);
const TASK_TRACKER_MAX_LINES = 840;
const TASK_OUTCOME_MAX_NONBLANK_LINES = 15;
const TASK_UI_OUTCOME_MAX_NONBLANK_LINES = 21;

function isDurablePath(path) {
  return DURABLE.some((pattern) => pattern.test(path));
}

function fieldValues(body, field) {
  return [...body.matchAll(new RegExp(`^${field}:\\s*(.+)$`, "gm"))].map(
    (match) => match[1].trim(),
  );
}

function countLines(text) {
  if (text.length === 0) return 0;
  const normalized = text.replaceAll("\r\n", "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
}

function countNonblankLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function validateTaskDoc(taskDoc) {
  const reasons = [];
  const trackerLines = countLines(taskDoc);
  if (trackerLines > TASK_TRACKER_MAX_LINES) {
    reasons.push(
      `${trackerLines} lines exceeds tracker budget ${TASK_TRACKER_MAX_LINES}`,
    );
  }
  const headings = [...taskDoc.matchAll(/^## (.+)$/gm)];
  const preamble = taskDoc.slice(0, headings[0]?.index ?? taskDoc.length);
  if (
    /^(?:State|Exit|Evidence|Blocker):/m.test(preamble) ||
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
    const hasUiAdvisorGate = /^UI Advisor Gate\s*$/m.test(body);
    const maxNonblankLines = hasUiAdvisorGate
      ? TASK_UI_OUTCOME_MAX_NONBLANK_LINES
      : TASK_OUTCOME_MAX_NONBLANK_LINES;
    const nonblankLines = 1 + countNonblankLines(body);

    if (nonblankLines > maxNonblankLines) {
      reasons.push(
        `"${title}" has ${nonblankLines} nonblank lines; exceeds ${maxNonblankLines} nonblank lines`,
      );
    }

    for (const field of REQUIRED_TASK_FIELDS) {
      if (fieldValues(body, field).length !== 1) {
        reasons.push(`"${title}" must contain exactly one ${field} field`);
      }
    }

    const state = fieldValues(body, "State")[0];
    const blockers = fieldValues(body, "Blocker");
    if (state && !TASK_STATES.has(state)) {
      reasons.push(`"${title}" has invalid State: ${state}`);
    }
    if (state === "blocked" && blockers.length !== 1) {
      reasons.push(`"${title}" needs one Blocker`);
    }
    if (state !== "blocked" && blockers.length > 0) {
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
    reasons.push("Status is not a task field; use State");
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

function validateArchitectureDoc(architectureDoc) {
  const reasons = [];
  const lines = new Set(architectureDoc.split(/\r?\n/));
  for (const heading of ARCHITECTURE_FORBIDDEN_HEADINGS) {
    if (lines.has(`## ${heading}`)) {
      reasons.push(`duplicates an owned contract in section: ${heading}`);
    }
  }
  for (const pointer of ARCHITECTURE_REQUIRED_POINTERS) {
    if (!architectureDoc.includes(pointer)) {
      reasons.push(`missing authority pointer: ${pointer}`);
    }
  }
  return reasons;
}

function collectViolations() {
  const violations = [];
  let files;
  try {
    files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "docs/plan"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .filter(Boolean)
      .filter((path) => existsSync(path) && !isDurablePath(path));
  } catch {
    return [{ path: "git", reason: "git ls-files unavailable" }];
  }

  for (const path of files) {
    violations.push({ path, reason: "non-durable plan/worklog snapshot" });
  }
  for (const [path, marker] of SNAPSHOT_MARKERS) {
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
  if (!existsSync(ARCHITECTURE_PATH)) {
    violations.push({
      path: ARCHITECTURE_PATH,
      reason: "architecture spec is missing",
    });
  } else {
    for (const reason of validateArchitectureDoc(
      readFileSync(ARCHITECTURE_PATH, "utf8"),
    )) {
      violations.push({ path: ARCHITECTURE_PATH, reason });
    }
  }
  return violations;
}

function runSelfTest() {
  const valid = `# Current Tasks

## Outcome

State: blocked
Exit: Observable result.
Evidence: Repeatable proof.
Blocker: External dependency.

- [ ] Run the proof.
`;
  assert.deepEqual(validateTaskDoc(valid), []);
  assert.deepEqual(validateTaskDoc("# Current Tasks\n"), []);
  assert.ok(
    validateTaskDoc("# Current Tasks\nState: ready\n- [ ] Orphan\n").length > 0,
  );
  assert.ok(
    validateTaskDoc(valid.replace("State: blocked\n", "")).some((reason) =>
      /State/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(valid.replace("- [ ] Run", "- [x] Run")).some((reason) =>
      /checked history/.test(reason),
    ),
  );
  assert.ok(
    validateTaskDoc(valid.replace("State: blocked", "State: done")).some(
      (reason) => /invalid State/.test(reason),
    ),
  );
  const oversizedOutcome = `${valid}${"- [ ] Extra proof.\n".repeat(10)}`;
  assert.ok(
    validateTaskDoc(oversizedOutcome).some((reason) =>
      /exceeds 15 nonblank lines/.test(reason),
    ),
  );
  const uiAdvisorAtLimit = valid.replace(
    "- [ ] Run the proof.\n",
    `UI Advisor Gate\n${"- Detail.\n".repeat(14)}- [ ] Run the proof.\n`,
  );
  assert.deepEqual(validateTaskDoc(uiAdvisorAtLimit), []);
  assert.ok(
    validateTaskDoc(`${uiAdvisorAtLimit}- One line too many.\n`).some(
      (reason) => /exceeds 21 nonblank lines/.test(reason),
    ),
  );
  const oversizedTracker = `# Current Tasks\n${"note\n".repeat(840)}`;
  assert.ok(
    validateTaskDoc(oversizedTracker).some((reason) =>
      /841 lines exceeds tracker budget 840/.test(reason),
    ),
  );
  assert.deepEqual(
    validateDecisionDoc("## D001: Accepted\n\n**Decision:** Keep it.\n"),
    [],
  );
  assert.ok(validateDecisionDoc("## D001: Option (NHÁP)\n").length > 0);
  const validArchitecture = ARCHITECTURE_REQUIRED_POINTERS.join("\n");
  assert.deepEqual(validateArchitectureDoc(validArchitecture), []);
  assert.ok(
    validateArchitectureDoc(
      `${validArchitecture.replaceAll("\n", "\r\n")}\r\n## Import Boundaries\r\n`,
    ).some((reason) => /Import Boundaries/.test(reason)),
  );
  assert.ok(
    validateArchitectureDoc(
      validArchitecture.replace(ARCHITECTURE_REQUIRED_POINTERS[0], ""),
    ).some((reason) => /project-placement-matrix/.test(reason)),
  );
  assert.equal(
    isDurablePath(["docs", "plan", "adr", "0021-example.md"].join("/")),
    true,
  );
  assert.equal(isDurablePath(["docs", "plan", "rollout.md"].join("/")), false);
  console.log("doc-staleness self-test passed.");
}

function main() {
  const violations = collectViolations();
  if (violations.length === 0) {
    console.log(
      "doc-staleness: durable docs and active task lifecycle are clean.",
    );
    return;
  }
  console.error(`doc-staleness: ${violations.length} stale artifact(s):`);
  for (const violation of violations) {
    console.error(`- ${violation.path}: ${violation.reason}`);
  }
  process.exitCode = 1;
}

if (process.argv.includes("--self-test")) runSelfTest();
else main();

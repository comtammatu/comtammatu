#!/usr/bin/env node
/**
 * Reports document size for reading/navigation review, never content removal.
 * Only the retired worklog tree blocks lint. Size remains advisory even with
 * legacy --strict callers. Policy: `engineering.md`, ADR 0021.
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const AGENT_RULE_REVIEW_LINES = 400;
const ADR_REVIEW_LINES = 150;
const TASK_TRACKER_REVIEW_LINES = 840;

function countLines(filePath) {
  const text = readFileSync(filePath, "utf8");
  if (text.length === 0) return 0;
  return text.endsWith("\n")
    ? text.slice(0, -1).split("\n").length
    : text.split("\n").length;
}

export function collectDocsBudgetErrors(repoRoot = REPO_ROOT) {
  const errors = [];
  const worklogRoot = join(repoRoot, "docs/worklog");

  if (existsSync(worklogRoot)) {
    errors.push(
      "docs/worklog/** is retired; delete the directory (git is the archive)",
    );
  }

  const rulesDir = join(repoRoot, "docs/agent/rules");
  if (existsSync(rulesDir)) {
    for (const entry of readdirSync(rulesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = `docs/agent/rules/${entry.name}`;
      const lines = countLines(join(rulesDir, entry.name));
      if (lines > AGENT_RULE_REVIEW_LINES) {
        errors.push(
          `${rel}: ${lines} lines; reading review threshold ${AGENT_RULE_REVIEW_LINES}`,
        );
      }
    }
  }

  const adrDir = join(repoRoot, "docs/plan/adr");
  if (existsSync(adrDir)) {
    for (const entry of readdirSync(adrDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = `docs/plan/adr/${entry.name}`;
      const lines = countLines(join(adrDir, entry.name));
      if (lines > ADR_REVIEW_LINES) {
        errors.push(
          `${rel}: ${lines} lines; reading review threshold ${ADR_REVIEW_LINES}`,
        );
      }
    }
  }

  const tracker = join(repoRoot, "tasks/todo.md");
  if (existsSync(tracker)) {
    const lines = countLines(tracker);
    if (lines > TASK_TRACKER_REVIEW_LINES) {
      errors.push(
        `tasks/todo.md: ${lines} lines; reading review threshold ${TASK_TRACKER_REVIEW_LINES}`,
      );
    }
  }
  return errors;
}

export function isDocsBudgetLintGate(error) {
  return error.startsWith("docs/worklog/** is retired;");
}

export function selectDocsBudgetErrors(allErrors) {
  return {
    errors: allErrors.filter(isDocsBudgetLintGate),
    advisories: allErrors.filter((error) => !isDocsBudgetLintGate(error)),
  };
}

function writeLines(filePath, lineCount) {
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${"x\n".repeat(lineCount)}`);
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "comtammatu-docs-budget-"));
  try {
    mkdirSync(join(fixture, "docs", "worklog"), { recursive: true });
    writeFileSync(join(fixture, "docs", "worklog", "README.md"), "# worklog\n");
    writeLines(join(fixture, "docs", "spec", "design-system.md"), 2000);
    writeLines(join(fixture, "docs", "plan", "adr", "9999-over.md"), 151);
    writeLines(join(fixture, "docs", "agent", "rules", "over.md"), 401);

    const all = collectDocsBudgetErrors(fixture);
    assert.match(all.join("\n"), /docs\/worklog/);
    assert.match(all.join("\n"), /docs\/plan\/adr\/9999-over\.md/);
    assert.match(all.join("\n"), /docs\/agent\/rules\/over\.md/);
    assert.doesNotMatch(all.join("\n"), /design-system/);

    const { errors, advisories } = selectDocsBudgetErrors(all, {
      strict: false,
    });
    assert.match(errors.join("\n"), /docs\/worklog/);
    assert.equal(errors.length, 1);
    assert.match(advisories.join("\n"), /docs\/plan\/adr\/9999-over\.md/);
    assert.match(advisories.join("\n"), /docs\/agent\/rules\/over\.md/);
    assert.equal(advisories.length, 2);

    const strict = selectDocsBudgetErrors(all, { strict: true });
    assert.equal(strict.errors.length, errors.length);
    assert.deepEqual(strict.advisories, advisories);
    rmSync(join(fixture, "docs", "worklog"), { recursive: true });
    assert.deepEqual(
      selectDocsBudgetErrors(collectDocsBudgetErrors(fixture), { strict: true })
        .errors,
      [],
    );
    writeLines(join(fixture, "tasks", "todo.md"), 841);
    const withTracker = selectDocsBudgetErrors(
      collectDocsBudgetErrors(fixture),
    );
    assert.deepEqual(withTracker.errors, []);
    assert.match(
      withTracker.advisories.join("\n"),
      /tasks\/todo\.md: 841 lines/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  console.log("[docs-budget] self-test passed");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const { errors, advisories } = selectDocsBudgetErrors(
    collectDocsBudgetErrors(REPO_ROOT),
  );

  for (const advisory of advisories) {
    console.warn(
      `[docs-budget] advisory (not a lint fail): ${advisory}; preserve required content and review navigation, not line count`,
    );
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[docs-budget] ${error}`);
    process.exit(1);
  }

  console.log(
    "[docs-budget] worklog boundary ok; document sizes are advisory only",
  );
}

main();

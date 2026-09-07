#!/usr/bin/env node
/**
 * Caps files the agent loads as a whole: `docs/agent/rules/*` (400),
 * ADRs (150), and the retired worklog tree. Spec/module/ref are on-demand
 * Read/rg and are not line-capped. Policy: `engineering.md`, ADR 0021.
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
const AGENT_RULE_MAX_LINES = 400;
const ADR_MAX_LINES = 150;

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
      if (lines > AGENT_RULE_MAX_LINES) {
        errors.push(
          `${rel}: ${lines} lines exceeds budget ${AGENT_RULE_MAX_LINES}`,
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
      if (lines > ADR_MAX_LINES) {
        errors.push(
          `${rel}: ${lines} lines exceeds budget ${ADR_MAX_LINES}`,
        );
      }
    }
  }

  return errors;
}

export function isDocsBudgetLintGate(error) {
  return (
    error.includes("docs/worklog") ||
    error.startsWith("docs/agent/rules/") ||
    error.startsWith("docs/plan/adr/")
  );
}

export function selectDocsBudgetErrors(allErrors, { strict }) {
  if (strict) return { errors: allErrors, advisories: [] };
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
    assert.match(errors.join("\n"), /docs\/plan\/adr\/9999-over\.md/);
    assert.match(errors.join("\n"), /docs\/agent\/rules\/over\.md/);
    assert.equal(advisories.length, 0);

    const strict = selectDocsBudgetErrors(all, { strict: true });
    assert.equal(strict.errors.length, errors.length);
    assert.equal(strict.advisories.length, 0);
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

  const strict = process.argv.includes("--strict");
  const { errors, advisories } = selectDocsBudgetErrors(
    collectDocsBudgetErrors(REPO_ROOT),
    { strict },
  );

  for (const advisory of advisories) {
    console.warn(`[docs-budget] advisory (not a lint fail): ${advisory}`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[docs-budget] ${error}`);
    process.exit(1);
  }

  console.log(
    "[docs-budget] worklog ban, ADR cap (150), and agent-rule cap (400) ok",
  );
}

main();

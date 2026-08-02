import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const INDEX_LOCK_FAILURE = /Could not acquire file lock/i;
const INDEX_FILE_FAILURE =
  /files? could not be (?:read|parsed)|files? with errors/i;

function run(command, args, print = true) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (print) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.error) throw result.error;
  return result;
}

function runSelfTest() {
  assert.equal(INDEX_LOCK_FAILURE.test("Indexed 1,624 files"), false);
  assert.equal(INDEX_LOCK_FAILURE.test("Could not acquire file lock"), true);
  assert.deepEqual(
    errorPaths("apps/web/page.tsx: Failed to read file: ENOENT\n"),
    ["apps/web/page.tsx"],
  );
  assert.equal(
    statusNeedsRefresh('{"initialized":true,"pendingChanges":{"added":0,"modified":0,"removed":0},"worktreeMismatch":null,"index":{"reindexRecommended":false}}'),
    false,
  );
  assert.equal(
    statusNeedsRefresh('{"initialized":true,"pendingChanges":{"added":0,"modified":1,"removed":0},"worktreeMismatch":null,"index":{"reindexRecommended":false}}'),
    true,
  );
  assert.equal(statusNeedsRefresh("not-json"), true);
  console.log("[agent-start] self-test passed (6 cases)");
}

function errorPaths(log) {
  return log
    .split("\n")
    .map((line) => line.match(/^(.+?): (?:Failed|Error)\b/)?.[1])
    .filter(Boolean);
}

function statusNeedsRefresh(output) {
  try {
    const status = JSON.parse(output);
    const pending = status.pendingChanges ?? {};
    return (
      status.initialized !== true ||
      status.worktreeMismatch !== null ||
      status.index?.reindexRecommended === true ||
      ["added", "modified", "removed"].some(
        (key) => Number(pending[key] ?? 0) > 0,
      )
    );
  } catch {
    return true;
  }
}

function main() {
  const skills = run("corepack", ["pnpm", "agent:skills"]);
  if (skills.status !== 0) process.exit(skills.status ?? 1);

  if (!existsSync(".codegraph")) {
    console.log(
      "[agent-start] CodeGraph skipped: .codegraph is not initialized; indexing is an owner decision.",
    );
    return;
  }

  const initialStatus = run("codegraph", ["status", "-j"], false);
  if (
    initialStatus.status === 0 &&
    !statusNeedsRefresh(initialStatus.stdout ?? "")
  ) {
    console.log("[agent-start] CodeGraph is current; refresh skipped.");
    return;
  }

  const index = run("codegraph", ["index", "."]);
  const indexOutput = `${index.stdout ?? ""}\n${index.stderr ?? ""}`;
  const failedExistingFiles = INDEX_FILE_FAILURE.test(indexOutput)
    ? errorPaths(readFileSync(".codegraph/errors.log", "utf8")).filter((path) =>
        existsSync(path),
      )
    : [];
  if (
    index.status !== 0 ||
    INDEX_LOCK_FAILURE.test(indexOutput) ||
    failedExistingFiles.length > 0
  ) {
    console.error("[agent-start] CodeGraph refresh did not complete cleanly.");
    process.exit(index.status || 1);
  }

  const status = run("codegraph", ["status", "."]);
  if (status.status !== 0) process.exit(status.status ?? 1);
}

if (process.argv.includes("--self-test")) runSelfTest();
else main();

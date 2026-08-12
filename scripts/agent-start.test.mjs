import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The CodeGraph npm shim is a globally-installed developer tool; CI runners
// do not carry it. Probe once so the smoke test can skip (rather than fail)
// when the binary is absent.
const codeGraphBinaryAvailable = (() => {
  const probe = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["codegraph"],
    { encoding: "utf8" },
  );
  return probe.status === 0;
})();

import {
  codeGraphAction,
  codeGraphErrorPaths,
  codeGraphInvocation,
  codeGraphRefreshFailed,
} from "./agent-start-policy.mjs";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptsDirectory);

function status(overrides = {}) {
  return JSON.stringify({
    initialized: true,
    pendingChanges: { added: 0, modified: 0, removed: 0 },
    worktreeMismatch: null,
    index: { reindexRecommended: false },
    ...overrides,
  });
}

test("launches the CodeGraph npm shim through the Windows command processor", { skip: !codeGraphBinaryAvailable }, () => {
  const invocation = codeGraphInvocation(["version"]);

  if (process.platform === "win32") {
    assert.equal(invocation.command, process.env.ComSpec ?? "cmd.exe");
    assert.deepEqual(invocation.args, [
      "/d",
      "/s",
      "/c",
      "codegraph",
      "version",
    ]);
  } else {
    assert.equal(invocation.command, "codegraph");
    assert.deepEqual(invocation.args, ["version"]);
  }

  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `${result.stdout ?? ""}${result.stderr ?? ""}`,
  );
});

test("skips refresh when the graph is current", () => {
  assert.equal(codeGraphAction(status()), "none");
});

test("uses incremental sync for pending file changes", () => {
  assert.equal(
    codeGraphAction(
      status({ pendingChanges: { added: 1, modified: 2, removed: 1 } }),
    ),
    "sync",
  );
});

test("uses a full index for an uninitialized or incompatible graph", () => {
  assert.equal(codeGraphAction(status({ initialized: false })), "index");
  assert.equal(
    codeGraphAction(
      status({ worktreeMismatch: { expected: "a", actual: "b" } }),
    ),
    "index",
  );
  assert.equal(
    codeGraphAction(status({ index: { reindexRecommended: true } })),
    "index",
  );
});

test("does not guess when status output is invalid", () => {
  assert.equal(codeGraphAction("not-json"), "unavailable");
  assert.equal(codeGraphAction("{}"), "unavailable");
});

test("recognizes lock and existing-file refresh failures", () => {
  assert.deepEqual(
    codeGraphErrorPaths("apps/web/page.tsx: Failed to read file: ENOENT\n"),
    ["apps/web/page.tsx"],
  );
  assert.equal(
    codeGraphRefreshFailed({ status: 0, output: "Indexed 1,579 files" }),
    false,
  );
  assert.equal(
    codeGraphRefreshFailed({
      status: 0,
      output: "Could not acquire file lock",
    }),
    true,
  );
  assert.equal(
    codeGraphRefreshFailed({
      status: 0,
      output: "Files with errors",
      failedExistingFiles: ["apps/web/page.tsx"],
    }),
    true,
  );
});

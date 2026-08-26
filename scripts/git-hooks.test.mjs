#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CI_GATES_PATH_IGNORE,
  GIT_HOOKS_DIR,
  isCiGatesPathIgnored,
  readGitHooksPath,
  shouldRunCiGatesVerify,
} from "./git-hooks-policy.mjs";
import { runPrePushHook } from "./git-hooks-pre-push.mjs";
import { installGitHooks } from "./install-git-hooks.mjs";

test("CI gates path-ignore mirrors workflow docs-only skips", () => {
  assert.ok(isCiGatesPathIgnored("docs/plan/decisions.md"));
  assert.ok(isCiGatesPathIgnored("README.md"));
  assert.ok(isCiGatesPathIgnored(".gitignore"));
  assert.ok(!isCiGatesPathIgnored("apps/web/page.tsx"));
  assert.ok(!isCiGatesPathIgnored("package.json"));
  assert.equal(CI_GATES_PATH_IGNORE.length, 5);
});

test("shouldRunCiGatesVerify skips docs-only pushes", () => {
  assert.equal(
    shouldRunCiGatesVerify({
      fromRef: "a",
      toRef: "b",
      changedFiles: ["docs/plan/decisions.md", "tasks/todo.md"],
    }),
    false,
  );
  assert.equal(
    shouldRunCiGatesVerify({
      fromRef: "a",
      toRef: "b",
      changedFiles: ["docs/plan/decisions.md", "apps/web/page.tsx"],
    }),
    true,
  );
  assert.equal(
    shouldRunCiGatesVerify({
      fromRef: "a",
      toRef: "b",
      changedFiles: [],
    }),
    false,
  );
});

test("runPrePushHook skips verify for docs-only refs, new branches, and deleted branches", () => {
  const logs = [];
  const verifyCalls = [];
  const status = runPrePushHook({
    stdin:
      "refs/heads/main abc refs/heads/main def\nrefs/heads/feature 111 refs/heads/feature 0000000000000000000000000000000000000000\n(delete) 0000000000000000000000000000000000000000 refs/heads/old 6297227e11fb6f0a195809c93970366ba65af054",
    listPaths: () => ["docs/plan/decisions.md"],
    runVerifyCommand: () => {
      verifyCalls.push(true);
      return 0;
    },
    log: {
      log: (message) => logs.push(message),
      error: () => {},
    },
  });
  assert.equal(status, 0);
  assert.equal(verifyCalls.length, 0);
  assert.match(logs.join("\n"), /Skipping verify/);
});

test("runPrePushHook runs verify when code paths change", () => {
  let verifyRuns = 0;
  const status = runPrePushHook({
    stdin: "refs/heads/main abc refs/heads/main def",
    listPaths: () => ["apps/web/page.tsx"],
    runVerifyCommand: () => {
      verifyRuns += 1;
      return 0;
    },
    log: console,
  });
  assert.equal(status, 0);
  assert.equal(verifyRuns, 1);
});

test("runPrePushHook blocks push when verify fails", () => {
  const status = runPrePushHook({
    stdin: "refs/heads/main abc refs/heads/main def",
    listPaths: () => ["package.json"],
    runVerifyCommand: () => 1,
    log: console,
  });
  assert.equal(status, 1);
});

test("tracked pre-push hook delegates to the Node runner", () => {
  const hook = readFileSync(join(process.cwd(), GIT_HOOKS_DIR, "pre-push"), "utf8");
  assert.match(hook, /scripts\/git-hooks-pre-push\.mjs/);
});

test("installGitHooks sets core.hooksPath when missing", () => {
  const result = installGitHooks({ log: { log: () => {} } });
  assert.equal(result.ok, true);
  assert.equal(readGitHooksPath(process.cwd()), GIT_HOOKS_DIR);
});

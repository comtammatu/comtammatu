#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_HOOKS_DIR } from "./git-hooks-policy.mjs";

const errors = [];

const prePushHook = join(process.cwd(), GIT_HOOKS_DIR, "pre-push");
try {
  const hook = readFileSync(prePushHook, "utf8");
  if (!/scripts\/git-hooks-pre-push\.mjs/.test(hook)) {
    errors.push(
      `${GIT_HOOKS_DIR}/pre-push must delegate to scripts/git-hooks-pre-push.mjs`,
    );
  }
} catch {
  errors.push(`${GIT_HOOKS_DIR}/pre-push is missing`);
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[git-hooks] ${message}`);
  }
  process.exit(1);
}

console.log("[git-hooks] contract check passed");

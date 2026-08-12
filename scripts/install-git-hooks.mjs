#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GIT_HOOKS_DIR, readGitHooksPath } from "./git-hooks-policy.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

export function installGitHooks({
  repoRoot = repositoryRoot,
  log = console,
} = {}) {
  if (!existsSync(join(repoRoot, ".git"))) {
    return { ok: false, reason: "not-a-repo" };
  }

  const hookPath = join(repoRoot, GIT_HOOKS_DIR, "pre-push");
  if (!existsSync(hookPath)) {
    return { ok: false, reason: "missing-pre-push-hook" };
  }

  const currentHooksPath = readGitHooksPath(repoRoot);
  if (currentHooksPath !== GIT_HOOKS_DIR) {
    const setResult = runGit(["config", "core.hooksPath", GIT_HOOKS_DIR]);
    if (setResult.status !== 0) {
      process.stderr.write(setResult.stderr ?? "");
      return { ok: false, reason: "config-failed" };
    }
  }

  log.log(`[git-hooks] core.hooksPath=${GIT_HOOKS_DIR}`);
  return { ok: true, reason: "installed" };
}

function main() {
  const result = installGitHooks();
  if (!result.ok && result.reason === "not-a-repo") {
    console.log("[git-hooks] skipped: not a git repository");
    return;
  }
  if (!result.ok) {
    console.error(`[git-hooks] install failed: ${result.reason}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

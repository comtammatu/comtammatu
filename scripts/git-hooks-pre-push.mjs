#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { shouldRunCiGatesVerify } from "./git-hooks-policy.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args, { cwd = repositoryRoot } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function listChangedPaths({ fromRef, toRef }) {
  const result = runGit(["diff", "--name-only", `${fromRef}..${toRef}`]);
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error(
      `git diff --name-only ${fromRef}..${toRef} failed with exit ${result.status}`,
    );
  }
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function runVerify() {
  const result = spawnSync("corepack", ["pnpm", "verify"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

export function runPrePushHook({
  stdin = "",
  listPaths = listChangedPaths,
  runVerifyCommand = runVerify,
  log = console,
} = {}) {
  const lines = stdin
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    if (!localRef || !localSha || !remoteRef || !remoteSha) {
      continue;
    }
    if (/^0+$/.test(remoteSha)) {
      continue;
    }

    const changedFiles = listPaths({ fromRef: remoteSha, toRef: localSha });
    if (
      !shouldRunCiGatesVerify({
        fromRef: remoteSha,
        toRef: localSha,
        changedFiles,
        listPaths,
      })
    ) {
      log.log(
        "[pre-push] Skipping verify: push only touches CI paths-ignore files.",
      );
      continue;
    }

    log.log(
      `[pre-push] Running corepack pnpm verify (same gate as CI job "gates") before pushing ${localRef} -> ${remoteRef}.`,
    );
    const status = runVerifyCommand();
    if (status !== 0) {
      log.error(
        "[pre-push] verify failed. Fix the failure locally before pushing.",
      );
      return status;
    }
  }

  return 0;
}

function readStdinSync() {
  if (process.stdin.isTTY) {
    return "";
  }
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const status = runPrePushHook({ stdin: readStdinSync() });
  process.exit(status);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

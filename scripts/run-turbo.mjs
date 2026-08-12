#!/usr/bin/env node
/**
 * Cross-platform turbo runner.
 *
 * Turbo executes workspace task scripts through the package-manager binary it
 * finds on PATH. On machines where only corepack is installed (no `pnpm`
 * shim), turbo fails with "Unable to find package manager binary". The old
 * `PATH=$(dirname $(command -v corepack)):$PATH` prefix only worked on POSIX
 * shells AND only when a pnpm shim lived next to corepack. This runner
 * instead materializes a tiny `pnpm` launcher that delegates to corepack
 * (which respects the pinned `packageManager` field) and prepends it to PATH
 * before invoking turbo, so `corepack pnpm verify` behaves identically on
 * Windows, macOS, and Linux.
 *
 * Usage: node scripts/run-turbo.mjs <turbo args...>
 * Example: node scripts/run-turbo.mjs run lint
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const localTurboBin = join(repoRoot, "node_modules", ".bin");
const shimDir = join(tmpdir(), "comtammatu-corepack-pnpm-shim");

function ensurePnpmShim() {
  mkdirSync(shimDir, { recursive: true });
  if (process.platform === "win32") {
    const launcher = join(shimDir, "pnpm.cmd");
    if (!existsSync(launcher)) {
      writeFileSync(launcher, "@echo off\r\ncorepack pnpm %*\r\n");
    }
  } else {
    const launcher = join(shimDir, "pnpm");
    if (!existsSync(launcher)) {
      writeFileSync(launcher, '#!/bin/sh\nexec corepack pnpm "$@"\n');
      chmodSync(launcher, 0o755);
    }
  }
}

ensurePnpmShim();

const env = {
  ...process.env,
  // The pnpm shim first, then node_modules/.bin so turbo resolves even when
  // this runner is invoked outside a pnpm script context.
  PATH: [shimDir, localTurboBin, process.env.PATH ?? ""].join(delimiter),
};

const result = spawnSync("turbo", process.argv.slice(2), {
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(`[run-turbo] failed to launch turbo: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

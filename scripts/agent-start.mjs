import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  codeGraphAction,
  codeGraphErrorPaths,
  codeGraphInvocation,
  codeGraphRefreshFailed,
  skillCheckInvocation,
} from "./agent-start-policy.mjs";

const INDEX_FILE_FAILURE =
  /files? could not be (?:read|parsed)|files? with errors/i;

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

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
  return result;
}

function runCodeGraph(args, print = true) {
  const invocation = codeGraphInvocation(args);
  return run(invocation.command, invocation.args, print);
}

function main() {
  const skillCheck = skillCheckInvocation(scriptsDirectory);
  const skills = run(skillCheck.command, skillCheck.args);
  if (skills.error) throw skills.error;
  if (skills.status !== 0) process.exit(skills.status ?? 1);

  if (!existsSync(".codegraph")) {
    console.log(
      "[agent-start] CodeGraph skipped: .codegraph is not initialized; indexing is an owner decision.",
    );
    return;
  }

  const initialStatus = runCodeGraph(["status", "--json"], false);
  if (initialStatus.error || initialStatus.status !== 0) {
    process.stdout.write(initialStatus.stdout ?? "");
    process.stderr.write(initialStatus.stderr ?? "");
    console.warn(
      "[agent-start] CodeGraph unavailable; continue with built-in search tools until the runtime is restored.",
    );
    return;
  }

  const action = codeGraphAction(initialStatus.stdout ?? "");
  if (action === "unavailable") {
    console.warn(
      "[agent-start] CodeGraph returned invalid status; refresh skipped to avoid an unsafe full rebuild.",
    );
    return;
  }
  if (action === "none") {
    console.log("[agent-start] CodeGraph is current; refresh skipped.");
    return;
  }

  const refresh = runCodeGraph([action, "."]);
  const refreshOutput = `${refresh.stdout ?? ""}\n${refresh.stderr ?? ""}`;
  const errorsLog = ".codegraph/errors.log";
  const failedExistingFiles =
    INDEX_FILE_FAILURE.test(refreshOutput) && existsSync(errorsLog)
      ? codeGraphErrorPaths(readFileSync(errorsLog, "utf8")).filter((path) =>
          existsSync(path),
        )
      : [];
  if (
    codeGraphRefreshFailed({
      status: refresh.status,
      error: refresh.error,
      output: refreshOutput,
      failedExistingFiles,
    })
  ) {
    console.warn(
      "[agent-start] CodeGraph refresh did not complete cleanly; continue with built-in search tools.",
    );
    return;
  }

  const status = runCodeGraph(["status", "."]);
  if (status.error || status.status !== 0) {
    console.warn(
      "[agent-start] CodeGraph post-refresh status is unavailable; verify it before graph-backed review.",
    );
  }
}

main();

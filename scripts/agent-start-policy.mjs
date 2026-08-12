const INDEX_LOCK_FAILURE = /Could not acquire file lock/i;

export function codeGraphInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "codegraph", ...args],
    };
  }

  return { command: "codegraph", args };
}

export function codeGraphErrorPaths(log) {
  return log
    .split("\n")
    .map((line) => line.match(/^(.+?): (?:Failed|Error)\b/)?.[1])
    .filter(Boolean);
}

export function codeGraphRefreshFailed({
  status,
  error,
  output,
  failedExistingFiles = [],
}) {
  return (
    Boolean(error) ||
    status !== 0 ||
    INDEX_LOCK_FAILURE.test(output) ||
    failedExistingFiles.length > 0
  );
}

export function codeGraphAction(output) {
  try {
    const status = JSON.parse(output);
    if (status?.initialized === false) return "index";
    if (
      status?.initialized !== true ||
      !("worktreeMismatch" in status) ||
      typeof status.index?.reindexRecommended !== "boolean" ||
      typeof status.pendingChanges !== "object" ||
      status.pendingChanges === null
    ) {
      return "unavailable";
    }

    const pending = status.pendingChanges;

    if (
      status.worktreeMismatch !== null ||
      status.index?.reindexRecommended === true
    ) {
      return "index";
    }

    if (
      ["added", "modified", "removed"].some(
        (key) => Number(pending[key] ?? 0) > 0,
      )
    ) {
      return "sync";
    }

    return "none";
  } catch {
    return "unavailable";
  }
}

import { spawnSync } from "node:child_process";

export const GIT_HOOKS_DIR = "git-hooks";
export const PRE_PUSH_HOOK = "pre-push";

/** Mirrors `.github/workflows/ci.yml` `paths-ignore` for the gates job. */
export const CI_GATES_PATH_IGNORE = [
  /^\.gitattributes$/,
  /^\.gitignore$/,
  /^LICENSE$/,
  /^docs\//,
  /\.md$/,
];

export function isCiGatesPathIgnored(path) {
  return CI_GATES_PATH_IGNORE.some((pattern) => pattern.test(path));
}

export function listChangedPaths({ fromRef, toRef, changedFiles = null }) {
  if (Array.isArray(changedFiles)) {
    return changedFiles.filter(Boolean);
  }
  if (!fromRef || !toRef) {
    return [];
  }
  return [];
}

export function shouldRunCiGatesVerify({
  fromRef,
  toRef,
  changedFiles = null,
  listPaths = listChangedPaths,
}) {
  const paths = listPaths({ fromRef, toRef, changedFiles });
  if (paths.length === 0) {
    return false;
  }
  return paths.some((path) => !isCiGatesPathIgnored(path));
}

export function readGitHooksPath(repoRoot) {
  // Git resolves linked worktrees and included config files itself.
  const result = spawnSync(
    "git",
    ["-C", repoRoot, "config", "--get", "core.hooksPath"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  return result.status === 0 ? result.stdout.trim() || null : null;
}

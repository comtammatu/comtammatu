import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  const configPath = join(repoRoot, ".git", "config");
  if (!existsSync(configPath)) {
    return null;
  }
  const match = readFileSync(configPath, "utf8").match(
    /^\s*hooksPath\s*=\s*(.+)\s*$/m,
  );
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^"(.*)"$/, "$1");
}

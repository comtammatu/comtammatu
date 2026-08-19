import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

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

function resolveGitDir(repoRoot) {
  const gitPath = join(repoRoot, ".git");
  if (!existsSync(gitPath)) {
    return null;
  }
  if (statSync(gitPath).isDirectory()) {
    return gitPath;
  }
  const match = readFileSync(gitPath, "utf8").match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) {
    return null;
  }
  const gitDir = match[1].trim();
  return isAbsolute(gitDir) ? gitDir : join(repoRoot, gitDir);
}

function readHooksPathFromConfig(configPath) {
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

export function readGitHooksPath(repoRoot) {
  const gitDir = resolveGitDir(repoRoot);
  if (!gitDir) {
    return null;
  }
  const fromWorktree = readHooksPathFromConfig(join(gitDir, "config"));
  if (fromWorktree) {
    return fromWorktree;
  }
  const commonDirFile = join(gitDir, "commondir");
  if (!existsSync(commonDirFile)) {
    return null;
  }
  const commonRel = readFileSync(commonDirFile, "utf8").trim();
  return readHooksPathFromConfig(join(gitDir, commonRel, "config"));
}

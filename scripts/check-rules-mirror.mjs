import fs from "node:fs";
import path from "node:path";

// AGENTS.md intentionally duplicates the Commands / Constraints / Architecture
// blocks from docs/agent/rules/engineering.md because some agents auto-load
// only their entrypoint file. This check blocks silent drift between the two
// copies: each mirrored block is delimited by HTML comment anchors
// `<!-- MIRROR:<name>:begin ... -->` / `<!-- MIRROR:<name>:end -->` and must be
// byte-identical (modulo surrounding whitespace) in both files.

const REPO_ROOT = process.cwd();

const FILE_A = "AGENTS.md";
const FILE_B = "docs/agent/rules/engineering.md";
const BLOCKS = ["commands", "constraints", "architecture"];

function extractBlock(text, name, file) {
  const beginTag = `<!-- MIRROR:${name}:begin`;
  const endTag = `<!-- MIRROR:${name}:end`;
  const beginIndex = text.indexOf(beginTag);
  const endIndex = text.indexOf(endTag);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`${file}: missing or malformed MIRROR:${name} anchors`);
  }
  const contentStart = text.indexOf("-->", beginIndex);
  if (contentStart === -1 || contentStart > endIndex) {
    throw new Error(`${file}: unterminated MIRROR:${name} begin anchor`);
  }
  return text.slice(contentStart + 3, endIndex).trim();
}

const textA = fs.readFileSync(path.join(REPO_ROOT, FILE_A), "utf8");
const textB = fs.readFileSync(path.join(REPO_ROOT, FILE_B), "utf8");

const errors = [];
for (const name of BLOCKS) {
  try {
    const blockA = extractBlock(textA, name, FILE_A);
    const blockB = extractBlock(textB, name, FILE_B);
    if (blockA !== blockB) {
      errors.push(
        `MIRROR:${name} drifted between ${FILE_A} and ${FILE_B}. The two copies are intentional duplicates — edit BOTH identically.`,
      );
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[rules-mirror] ${message}`);
  process.exit(1);
}

console.log(
  `[rules-mirror] ${BLOCKS.length} mirrored blocks in sync (${FILE_A} ↔ ${FILE_B})`,
);

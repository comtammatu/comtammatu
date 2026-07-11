import fs from "node:fs";
import path from "node:path";

// Safety-critical constraints are intentionally duplicated because some agents
// receive only one rule surface. This check blocks silent drift between the
// copies: each mirrored block is delimited
// by HTML comment anchors `<!-- MIRROR:<name>:begin ... -->` /
// `<!-- MIRROR:<name>:end -->` and must be byte-identical (modulo
// surrounding whitespace) across every file in its pair.

const REPO_ROOT = process.cwd();

// Each entry: two files that share a set of MIRROR-tagged blocks.
const MIRROR_PAIRS = [
  {
    fileA: "AGENTS.md",
    fileB: "docs/agent/rules/engineering.md",
    blocks: ["constraints"],
  },
];

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

const errors = [];
let blockCount = 0;

for (const { fileA, fileB, blocks } of MIRROR_PAIRS) {
  const textA = fs.readFileSync(path.join(REPO_ROOT, fileA), "utf8");
  const textB = fs.readFileSync(path.join(REPO_ROOT, fileB), "utf8");

  for (const name of blocks) {
    blockCount += 1;
    try {
      const blockA = extractBlock(textA, name, fileA);
      const blockB = extractBlock(textB, name, fileB);
      if (blockA !== blockB) {
        errors.push(
          `MIRROR:${name} drifted between ${fileA} and ${fileB}. The two copies are intentional duplicates — edit BOTH identically.`,
        );
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[rules-mirror] ${message}`);
  process.exit(1);
}

const fileList = [...new Set(MIRROR_PAIRS.flatMap((p) => [p.fileA, p.fileB]))];
console.log(
  `[rules-mirror] ${blockCount} mirrored blocks in sync (${fileList.join(" ↔ ")})`,
);

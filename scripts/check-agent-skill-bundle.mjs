import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const BUNDLE_PATH = ".agents/skills";
const MANIFEST_PATH = "docs/agent/skills-manifest.json";
const REQUIRED_SKILLS = [
  "ai-elements",
  "building-components",
  "next-best-practices",
  "next-cache-components",
  "next-upgrade",
  "playwright",
  "shadcn",
  "supabase",
  "supabase-postgres-best-practices",
  "turborepo",
  "vercel-react-best-practices",
  "web-design-guidelines",
];

function sameNames(left, right) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function collectFiles(root, relative = "") {
  const directory = join(root, relative);
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return collectFiles(root, child);
      if (entry.isFile()) return [child];
      throw new Error(`${BUNDLE_PATH}/${child}: only regular files and directories are allowed`);
    });
}

function normalizeTextLineEndings(contents) {
  if (contents.includes(0)) return contents;

  const decoded = contents.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(contents)) return contents;

  return Buffer.from(decoded.replaceAll("\r\n", "\n"), "utf8");
}

function hashTree(root) {
  const hash = createHash("sha256");
  for (const file of collectFiles(root)) {
    const contents = readFileSync(join(root, file));
    hash.update(file).update("\0").update(normalizeTextLineEndings(contents));
  }
  return hash.digest("hex");
}

function buildManifest(bundleRoot) {
  return {
    bundleVersion: 1,
    skills: Object.fromEntries(
      REQUIRED_SKILLS.map((name) => [name, hashTree(join(bundleRoot, name))]),
    ),
  };
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function validateSkillBundle(bundleRoot, manifest) {
  const errors = [];
  if (manifest?.bundleVersion !== 1 || typeof manifest.skills !== "object") {
    return ["skills manifest must contain bundleVersion 1 and a skills object"];
  }

  const required = [...REQUIRED_SKILLS].sort();
  const declared = Object.keys(manifest.skills).sort();
  if (!sameNames(declared, required)) {
    errors.push(`manifest skills must be exactly ${required.join(", ")}`);
  }
  if (!existsSync(bundleRoot) || !statSync(bundleRoot).isDirectory()) {
    return [...errors, `${BUNDLE_PATH} must exist as a directory`];
  }

  const actual = readdirSync(bundleRoot, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  if (!sameNames(actual, required)) {
    errors.push(`${BUNDLE_PATH} must contain exactly ${required.join(", ")}`);
  }

  for (const name of required) {
    const skillRoot = join(bundleRoot, name);
    const skillFile = join(skillRoot, "SKILL.md");
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) {
      errors.push(`${BUNDLE_PATH}/${name}/SKILL.md is required`);
      continue;
    }
    const expectedHash = manifest.skills[name];
    if (!/^[a-f0-9]{64}$/.test(expectedHash ?? "")) {
      errors.push(`manifest hash for ${name} must be SHA-256`);
      continue;
    }
    try {
      if (hashTree(skillRoot) !== expectedHash) {
        errors.push(`${BUNDLE_PATH}/${name} hash drifted; update the bundle and manifest together`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return errors;
}

function writeFixtureSkill(root, name, content = "# fixture\n") {
  const skillRoot = join(root, name);
  mkdirSync(skillRoot, { recursive: true });
  writeFileSync(join(skillRoot, "SKILL.md"), content);
}

function runSelfTest() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "comtammatu-agent-skills-"));
  try {
    for (const name of REQUIRED_SKILLS) writeFixtureSkill(fixtureRoot, name, `# ${name}\n`);
    const manifest = buildManifest(fixtureRoot);
    assert.deepEqual(validateSkillBundle(fixtureRoot, manifest), []);

    writeFixtureSkill(fixtureRoot, "ai-elements", "# ai-elements\r\n");
    assert.deepEqual(validateSkillBundle(fixtureRoot, manifest), []);

    const binaryFixture = join(fixtureRoot, "ai-elements", "fixture.bin");
    writeFileSync(binaryFixture, Buffer.from([0, 13, 10, 255]));
    const binaryManifest = buildManifest(fixtureRoot);
    writeFileSync(binaryFixture, Buffer.from([0, 10, 10, 255]));
    assert.match(
      validateSkillBundle(fixtureRoot, binaryManifest).join("\n"),
      /ai-elements hash drifted/,
    );
    rmSync(binaryFixture);

    rmSync(join(fixtureRoot, "shadcn", "SKILL.md"));
    assert.match(
      validateSkillBundle(fixtureRoot, manifest).join("\n"),
      /shadcn\/SKILL\.md is required/,
    );

    writeFixtureSkill(fixtureRoot, "shadcn", "# changed\n");
    assert.match(
      validateSkillBundle(fixtureRoot, manifest).join("\n"),
      /shadcn hash drifted/,
    );

    writeFileSync(join(fixtureRoot, "unexpected.md"), "unexpected\n");
    assert.match(
      validateSkillBundle(fixtureRoot, manifest).join("\n"),
      /\.agents\/skills must contain exactly/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log("[agent-skills] self-test passed (6 cases)");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else if (process.argv.includes("--print-manifest")) {
  console.log(JSON.stringify(buildManifest(join(REPO_ROOT, BUNDLE_PATH)), null, 2));
} else {
  const manifest = readManifest(join(REPO_ROOT, MANIFEST_PATH));
  const errors = manifest.error
    ? [`${MANIFEST_PATH}: ${manifest.error}`]
    : validateSkillBundle(join(REPO_ROOT, BUNDLE_PATH), manifest);
  if (errors.length > 0) {
    for (const error of errors) console.error(`[agent-skills] ${error}`);
    process.exit(1);
  }
  console.log(`[agent-skills] ${REQUIRED_SKILLS.length} required skills match the locked bundle`);
}

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = ".tmp/okf";
const SOURCE_ROOTS = ["AGENTS.md", "docs", "tasks"];
const RESERVED_CONCEPT_FILENAMES = new Set(["index.md", "log.md"]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function yamlString(value) {
  return JSON.stringify(value);
}

function readMarkdownFiles(root) {
  const absoluteRoot = path.join(REPO_ROOT, root);
  if (!fs.existsSync(absoluteRoot)) return [];

  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) return root.endsWith(".md") ? [absoluteRoot] : [];

  const files = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      const next = args[index + 1];
      if (!next) throw new Error("--out requires a directory");
      outputDir = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { outputDir };
}

function resolveOutputDir(outputDir) {
  const resolved = path.resolve(REPO_ROOT, outputDir);
  const relative = toPosix(path.relative(REPO_ROOT, resolved));

  if (
    relative === "" ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("OKF output must stay inside the repository");
  }

  if (!relative.startsWith(".tmp/")) {
    throw new Error(
      "OKF output must stay under .tmp/ so it remains disposable",
    );
  }

  return resolved;
}

function extractTitle(content, sourcePath) {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim();

  const basename = path.basename(sourcePath, ".md");
  return basename
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function extractDescription(content, title) {
  const lines = content.split(/\r?\n/);
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (
      inCodeBlock ||
      trimmed === "" ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      trimmed === "---"
    ) {
      continue;
    }

    return trimmed.replace(/\s+/g, " ").slice(0, 180);
  }

  return `Project knowledge document for ${title}.`;
}

function typeFor(sourcePath) {
  if (sourcePath === "AGENTS.md") return "Agent Entry Point";
  if (sourcePath.startsWith("docs/agent/rules/")) return "Agent Rule";
  if (sourcePath.startsWith("docs/modules/")) return "Module Document";
  if (sourcePath.startsWith("docs/spec/")) return "Specification";
  if (sourcePath.startsWith("docs/ref/")) return "Reference Document";
  if (sourcePath.startsWith("docs/runbooks/")) return "Runbook";
  if (sourcePath.startsWith("docs/plan/adr/")) return "Architecture Decision";
  if (sourcePath.startsWith("docs/plan/")) return "Planning Document";
  if (sourcePath.startsWith("docs/worklog/")) return "Worklog";
  if (sourcePath.startsWith("docs/user-guides/")) return "User Guide";
  if (sourcePath.startsWith("tasks/")) return "Task And Learning Tracker";
  if (sourcePath.startsWith("docs/architecture/"))
    return "Architecture Document";
  return "Project Document";
}

function tagsFor(sourcePath) {
  const tags = ["comtammatu", "okf-export"];
  const parts = sourcePath.split("/");

  if (sourcePath === "AGENTS.md") tags.push("agent-entrypoint");
  if (parts[0] === "docs" && parts[1]) tags.push(parts[1]);
  if (parts[0] === "tasks") tags.push("tasks");
  if (sourcePath.includes("finance")) tags.push("finance");
  if (sourcePath.includes("inventory")) tags.push("inventory");
  if (sourcePath.includes("pos")) tags.push("pos");
  if (sourcePath.includes("hddt") || sourcePath.includes("einvoice")) {
    tags.push("einvoice");
  }

  return [...new Set(tags)];
}

function conceptPathFor(sourcePath) {
  const parsed = path.posix.parse(sourcePath);
  if (!RESERVED_CONCEPT_FILENAMES.has(parsed.base)) return sourcePath;

  return path.posix.join(parsed.dir, `_${parsed.name}.md`);
}

function buildFrontmatter({ sourcePath, title, description, timestamp }) {
  const tags = tagsFor(sourcePath);

  return [
    "---",
    `type: ${yamlString(typeFor(sourcePath))}`,
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    `resource: ${yamlString(`repo://comtammatu/${sourcePath}`)}`,
    "tags:",
    ...tags.map((tag) => `  - ${yamlString(tag)}`),
    `timestamp: ${yamlString(timestamp)}`,
    `source_path: ${yamlString(sourcePath)}`,
    "---",
    "",
  ].join("\n");
}

function writeFile(absolutePath, content) {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function addDirectoryEntry(map, dir, entry) {
  const current = map.get(dir) ?? [];
  current.push(entry);
  map.set(dir, current);
}

function collectDirectoryIndexes(entries) {
  const byDir = new Map();
  const subdirsByDir = new Map();

  for (const entry of entries) {
    const dir = path.posix.dirname(entry.outputPath);
    addDirectoryEntry(byDir, dir === "." ? "" : dir, entry);

    const parts = entry.outputPath.split("/");
    for (let index = 0; index < parts.length - 1; index += 1) {
      const parent = parts.slice(0, index).join("/");
      const child = parts.slice(0, index + 1).join("/");
      const children = subdirsByDir.get(parent) ?? new Set();
      children.add(child);
      subdirsByDir.set(parent, children);
    }
  }

  return { byDir, subdirsByDir };
}

function indexTitleFor(dir) {
  if (!dir) return "Cơm Tấm Má Tư OKF Export";
  return dir;
}

function writeIndexes(outRoot, entries) {
  const { byDir, subdirsByDir } = collectDirectoryIndexes(entries);
  const allDirs = new Set(["", ...byDir.keys(), ...subdirsByDir.keys()]);

  for (const dir of [...allDirs].sort()) {
    const concepts = (byDir.get(dir) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    const subdirs = [...(subdirsByDir.get(dir) ?? [])].sort();
    const lines = [];

    if (dir === "") {
      lines.push("---", 'okf_version: "0.1"', "---", "");
    }

    lines.push(`# ${indexTitleFor(dir)}`, "");

    if (dir === "") {
      lines.push(
        "Generated from the current repository Markdown authority files by `pnpm docs:okf`.",
        "The source docs remain the authority; this bundle is a disposable browsing and agent context artifact.",
        "",
      );
    }

    if (subdirs.length > 0) {
      lines.push("## Directories", "");
      for (const child of subdirs) {
        const name = path.posix.basename(child);
        const relative = dir ? path.posix.relative(dir, child) || "." : child;
        lines.push(`* [${name}](${relative}/) - Generated OKF directory.`);
      }
      lines.push("");
    }

    if (concepts.length > 0) {
      lines.push("## Concepts", "");
      for (const concept of concepts) {
        const relative = dir
          ? path.posix.relative(dir, concept.outputPath)
          : concept.outputPath;
        lines.push(
          `* [${concept.title}](${relative}) - ${concept.description}`,
        );
      }
      lines.push("");
    }

    writeFile(
      path.join(outRoot, dir, "index.md"),
      `${lines.join("\n").trim()}\n`,
    );
  }
}

function main() {
  const { outputDir } = parseArgs();
  const outRoot = resolveOutputDir(outputDir);
  const markdownFiles = SOURCE_ROOTS.flatMap(readMarkdownFiles).sort();

  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const entries = [];
  for (const filePath of markdownFiles) {
    const sourcePath = toPosix(path.relative(REPO_ROOT, filePath));
    const outputPath = conceptPathFor(sourcePath);
    const content = fs.readFileSync(filePath, "utf8").trimEnd();
    const stat = fs.statSync(filePath);
    const title = extractTitle(content, sourcePath);
    const description = extractDescription(content, title);
    const timestamp = stat.mtime.toISOString();
    const frontmatter = buildFrontmatter({
      sourcePath,
      title,
      description,
      timestamp,
    });

    writeFile(path.join(outRoot, outputPath), `${frontmatter}${content}\n`);
    entries.push({ outputPath, sourcePath, title, description });
  }

  writeIndexes(outRoot, entries);

  console.log(
    `OKF export wrote ${entries.length} concepts to ${path.relative(
      REPO_ROOT,
      outRoot,
    )}`,
  );
}

main();

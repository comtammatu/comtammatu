import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// PreToolUse guard for agent sessions. Machine enforcement of the
// Environment Registry in docs/agent/rules/database.md — this script is an
// adapter to that rule, not a second source of truth. The refs below MUST
// match the registry table; update both in the same change.
//
// One canonical copy. Optional local adapters (`.claude/settings.json`,
// `.codex/hooks.json`) may wire PreToolUse to this file when present; they are
// not tracked. scripts/check-guard-sync.mjs keeps the registry and this script
// in sync, validates any present adapters, and replays behavior fixtures so
// regex edits cannot silently weaken blocking.
//
// Blocks (exit 2): state-mutating Supabase CLI subcommands unless a supported
// command binds its literal database URL to a verified Preview Branch or the
// registered Production target; psql
// writes against a protected or unverified connection; pg_restore toward a
// protected or unverified target; HTTP writes plus non-catalog Production
// reads; and
// write-capable Supabase MCP tools targeting a protected or unregistered ref.
// Preview branch delete is allowed for cleanup; creation is allowed only when
// supabase/migration-lineage.json proves the repository baseline and production
// ledger are aligned. Branch merge/reset/rebase remains blocked. Read paths
// require a literal registered target or a mechanically verified pinned MCP.
//
// Known residual gaps (text matching cannot close them; the real fix is
// keeping prod credentials out of the local agent env): SDK writes via
// node/python one-liners, raw-IP connection strings, and keywords split by
// shell string concatenation.

const PROTECTED_REFS = {
  enloyfnuerqgaqderbwb: "PRODUCTION TARGET (CTCP Chén Sứ)",
};

const REGISTERED_WRITE_REFS = new Set(["enloyfnuerqgaqderbwb"]);

const APPROVED_PREVIEW_PARENT_REF = "enloyfnuerqgaqderbwb";

const CODEX_CONFIG = new URL("../.codex/config.toml", import.meta.url);

const LIBPQ_UNVERIFIED_ENV = [
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGOPTIONS",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
];

function registeredReadableRef(ref) {
  return (
    ref === APPROVED_PREVIEW_PARENT_REF ||
    REGISTERED_WRITE_REFS.has(ref) ||
    trustedPreviewProject(ref) !== null
  );
}

function codexSupabaseBindingVerified() {
  try {
    const source = readFileSync(CODEX_CONFIG, "utf8");
    const sectionHeaders = [
      ...source.matchAll(/^\[mcp_servers\.supabase\]\s*$/gm),
    ];
    if (sectionHeaders.length !== 1) return false;
    const sectionHeader = sectionHeaders[0];
    const section = source
      .slice(sectionHeader.index + sectionHeader[0].length)
      .split(/^\[/m)[0];

    const urlValues = [
      ...section.matchAll(/^url\s*=\s*"([^"\r\n]+)"\s*$/gm),
    ].map((match) => match[1]);
    if (urlValues.length !== 1) return false;

    const url = new URL(urlValues[0]);
    return (
      url.protocol === "https:" &&
      url.hostname === "mcp.supabase.com" &&
      url.pathname === "/mcp" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.searchParams.getAll("project_ref").length === 1 &&
      url.searchParams.get("project_ref") === APPROVED_PREVIEW_PARENT_REF &&
      url.searchParams.getAll("read_only").length === 1 &&
      url.searchParams.get("read_only") === "true"
    );
  } catch {
    return false;
  }
}

function trustedPreviewBranch(candidate) {
  if (typeof candidate !== "string" || !/^[a-z0-9-]{1,64}$/.test(candidate)) {
    return null;
  }

  try {
    const result = spawnSync(
      "supabase",
      [
        "branches",
        "list",
        "--project-ref",
        APPROVED_PREVIEW_PARENT_REF,
        "--output",
        "json",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        // Windows resolves supabase.cmd only when shell is enabled.
        shell: process.platform === "win32",
      },
    );
    if (result.status !== 0 || result.error) return null;

    const branch = JSON.parse(result.stdout).find(
      (item) =>
        item?.id === candidate ||
        item?.name === candidate ||
        item?.project_ref === candidate,
    );
    return branch &&
      typeof branch === "object" &&
      !Array.isArray(branch) &&
      typeof branch.id === "string" &&
      branch.id !== "" &&
      typeof branch.project_ref === "string" &&
      typeof branch.parent_project_ref === "string" &&
      branch.parent_project_ref === APPROVED_PREVIEW_PARENT_REF
      ? branch
      : null;
  } catch {
    return null;
  }
}

function trustedPreviewProject(ref) {
  if (typeof ref !== "string" || !/^[a-z0-9]{20}$/.test(ref)) return null;
  const branch = trustedPreviewBranch(ref);
  return branch?.project_ref === ref ? branch : null;
}

function supabaseCliFlagValues(args, flag) {
  const values = [];
  let sawOtherOption = false;

  for (let index = 2; index < args.length; index += 1) {
    const token = args[index];
    if (token === flag || token.startsWith(`${flag}=`)) {
      if (sawOtherOption) return [];
      values.push(
        token === flag ? (args[++index] ?? "") : token.slice(flag.length + 1),
      );
    } else if (token.startsWith("-")) {
      sawOtherOption = true;
    }
  }
  return values;
}

function shellSegments(command) {
  const segments = [];
  let start = 0;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(command[index - 1] ?? ""))) {
      segments.push(command.slice(start, index));
      const newline = command.indexOf("\n", index);
      if (newline === -1) {
        start = command.length;
        break;
      }
      start = newline + 1;
      index = newline;
      continue;
    }
    if (
      char === "&" &&
      (command[index - 1] === ">" || command[index + 1] === ">")
    ) {
      continue;
    }
    if (char === ";" || char === "\n" || char === "|" || char === "&") {
      segments.push(command.slice(start, index));
      if (
        command[index + 1] === char ||
        (char === "|" && command[index + 1] === "&")
      ) {
        index += 1;
      }
      start = index + 1;
    }
  }

  segments.push(command.slice(start));
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

function shellTokens(command) {
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;

  const flush = () => {
    if (token !== "") tokens.push(token);
    token = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      const next = command[index + 1] ?? "";
      if (!quote || ['"', "\\", "$", "`", "\n"].includes(next)) {
        escaped = true;
        continue;
      }
      token += char;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    token += char;
  }
  if (escaped || quote) return [];
  flush();
  return tokens;
}

function commandTokenBasename(token) {
  return (token ?? "").split("/").at(-1) ?? "";
}

function resolveDirectCommand(tokens) {
  let index = 0;
  const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/;

  while (assignment.test(tokens[index] ?? "")) index += 1;
  while (index < tokens.length) {
    const basename = commandTokenBasename(tokens[index]);
    if (basename === "env") {
      index += 1;
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === "--") {
          index += 1;
          break;
        }
        if (assignment.test(token)) {
          index += 1;
          continue;
        }
        if (/^--split-string(?:=|$)/.test(token) || /^-[^-]*S/.test(token)) {
          return { index: -1, dynamic: true };
        }
        if (["-u", "--unset", "-C", "--chdir", "--argv0"].includes(token)) {
          index += 2;
          continue;
        }
        if (/^--(?:unset|chdir|argv0)=/.test(token)) {
          index += 1;
          continue;
        }
        if (token.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      while (assignment.test(tokens[index] ?? "")) index += 1;
      continue;
    }
    if (basename === "command") {
      index += 1;
      while ((tokens[index] ?? "").startsWith("-")) index += 1;
      continue;
    }
    if (basename === "exec") {
      index += 1;
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === "--") {
          index += 1;
          break;
        }
        if (token === "-a") {
          index += 2;
          continue;
        }
        if (token.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (basename === "sudo") {
      index = skipRunnerOptions(
        tokens,
        index + 1,
        new Set([
          "-C",
          "-D",
          "-g",
          "-h",
          "-p",
          "-r",
          "-t",
          "-u",
          "--chdir",
          "--close-from",
          "--group",
          "--host",
          "--prompt",
          "--role",
          "--type",
          "--user",
        ]),
      );
      continue;
    }
    if (basename === "nohup") {
      index += 1;
      while ((tokens[index] ?? "").startsWith("-")) index += 1;
      continue;
    }
    if (basename === "nice") {
      index = skipRunnerOptions(
        tokens,
        index + 1,
        new Set(["-n", "--adjustment"]),
      );
      continue;
    }
    if (basename === "time") {
      index = skipRunnerOptions(
        tokens,
        index + 1,
        new Set(["-f", "-o", "--format", "--output"]),
      );
      continue;
    }
    if (basename === "timeout") {
      index = skipRunnerOptions(
        tokens,
        index + 1,
        new Set(["-k", "-s", "--kill-after", "--signal"]),
      );
      if (index < tokens.length) index += 1;
      continue;
    }
    if (basename === "stdbuf") {
      index = skipRunnerOptions(
        tokens,
        index + 1,
        new Set(["-e", "-i", "-o"]),
      );
      continue;
    }
    break;
  }

  return {
    index: index < tokens.length ? index : -1,
    dynamic: false,
  };
}

function directCommandIndex(tokens) {
  return resolveDirectCommand(tokens).index;
}

function skipRunnerOptions(tokens, start, valueOptions) {
  let index = start;
  while (index < tokens.length && tokens[index].startsWith("-")) {
    const token = tokens[index];
    const option = token.split("=", 1)[0];
    index += valueOptions.has(option) && !token.includes("=") ? 2 : 1;
  }
  return index;
}

function supabaseCommandIndex(tokens) {
  let index = directCommandIndex(tokens);
  if (index === -1) return -1;
  let basename = commandTokenBasename(tokens[index]);
  if (basename === "supabase" || basename.startsWith("supabase@")) {
    return index;
  }

  if (
    basename === "corepack" &&
    commandTokenBasename(tokens[index + 1]) === "pnpm"
  ) {
    index += 1;
    basename = "pnpm";
  }

  if (["npx", "bunx"].includes(basename)) {
    index = skipRunnerOptions(
      tokens,
      index + 1,
      new Set([
        "-c",
        "-p",
        "--cache",
        "--call",
        "--package",
        "--prefix",
        "--userconfig",
      ]),
    );
  } else if (["npm", "pnpm", "yarn"].includes(basename)) {
    index = skipRunnerOptions(tokens, index + 1, new Set(["--dir", "--filter"]));
    if (
      !["exec", ...(basename === "npm" ? [] : ["dlx"])].includes(
        tokens[index],
      )
    ) {
      return -1;
    }
    index += 1;
    if (tokens[index] === "--") index += 1;
    index = skipRunnerOptions(
      tokens,
      index,
      new Set(["-p", "--package", "--shell-mode"]),
    );
  }

  basename = commandTokenBasename(tokens[index]);
  if (basename === "dotenv") {
    index = skipRunnerOptions(tokens, index + 1, new Set(["-e", "--env"]));
    if (tokens[index] === "--") index += 1;
    basename = commandTokenBasename(tokens[index]);
  }

  return basename === "supabase" || basename.startsWith("supabase@")
    ? index
    : -1;
}

function hasDynamicRunnerComposition(command) {
  const tokens = shellTokens(command);
  const resolution = resolveDirectCommand(tokens);
  if (resolution.dynamic) return true;
  if (commandTokenBasename(tokens[resolution.index]) !== "npx") return false;

  for (let index = resolution.index + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-c" || /^--call(?:=|$)/.test(token)) return true;
    if (!token.startsWith("-")) return false;
    if (
      ["-p", "--cache", "--package", "--prefix", "--userconfig"].includes(
        token,
      )
    ) {
      index += 1;
    }
  }
  return false;
}

function hasDynamicShellInvocation(command) {
  const tokens = shellTokens(command);
  const index = directCommandIndex(tokens);
  const basename = commandTokenBasename(tokens[index]);
  if (basename === "eval") return true;
  if (!new Set(["bash", "dash", "ksh", "sh", "zsh"]).has(basename)) {
    return false;
  }

  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token === "--command" || token.startsWith("--command=")) return true;
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(token)) return true;
    if (!token.startsWith("-")) return false;
  }
  return false;
}

function hasUnquotedShellGrouping(command) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(" || char === ")") return true;
  }
  return false;
}

function hasUnquotedShellInput(command) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "<") return true;
  }
  return false;
}

function hasUnquotedDynamicExpansion(command) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "`") return true;
  }
  return false;
}

function hasActiveShellExpansion(command) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else if (quote === '"' && char === "$") return true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "$") return true;
  }
  return false;
}

function registeredDatabaseUrlRef(value) {
  try {
    const url = new URL(value);
    const hostMatch = url.hostname.match(
      /^db\.([a-z0-9]{20})\.supabase\.co$/,
    );
    if (!/^postgres(?:ql)?:$/.test(url.protocol) || url.hash) {
      return null;
    }

    const safeParams = new Set([
      "application_name",
      "connect_timeout",
      "sslmode",
    ]);
    for (const key of url.searchParams.keys()) {
      if (!safeParams.has(key)) return null;
    }
    if (hostMatch) {
      const ref = hostMatch[1];
      return registeredReadableRef(ref) ? ref : null;
    }

    return null;
  } catch {
    return null;
  }
}

function inheritedLibpqTargetOverride() {
  return LIBPQ_UNVERIFIED_ENV.find(
    (name) => typeof process.env[name] === "string" && process.env[name] !== "",
  );
}

function parsePsql(command) {
  const tokens = shellTokens(command);
  const start = directCommandIndex(tokens);
  if (commandTokenBasename(tokens[start]).toLowerCase() !== "psql") return null;

  const result = {
    targets: [],
    commands: [],
    hasScriptFile: false,
    isHelp: false,
    hasOptionTerminator: false,
    startupFilesDisabled: false,
    hasVariables: false,
    hasTargetOverride: tokens.some((token) =>
      /^(?:PGHOST|PGHOSTADDR|PGSERVICE|PGSERVICEFILE)=/i.test(token),
    ),
  };
  const valueOptions = new Set([
    "--field-separator",
    "--log-file",
    "--output",
    "--port",
    "--pset",
    "--record-separator",
    "--set",
    "--username",
    "--variable",
    "-F",
    "-L",
    "-o",
    "-P",
    "-p",
    "-R",
    "-T",
    "-U",
    "-v",
  ]);

  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextValue = () => tokens[++index] ?? "";

    if (token === "--") {
      result.hasOptionTerminator = true;
      break;
    } else if (["--help", "--version", "-?", "-V"].includes(token)) {
      result.isHelp = true;
    } else if (token === "-X" || token === "--no-psqlrc") {
      result.startupFilesDisabled = true;
    } else if (token === "-d" || token === "--dbname") {
      result.targets.push(nextValue());
    } else if (/^--dbname=/.test(token)) {
      result.targets.push(token.slice("--dbname=".length));
    } else if (/^-d.+/.test(token)) {
      result.targets.push(token.slice(2));
    } else if (token === "-h" || token === "--host") {
      result.hasTargetOverride = true;
      nextValue();
    } else if (/^--host=/.test(token) || /^-h.+/.test(token)) {
      result.hasTargetOverride = true;
    } else if (token === "-p" || token === "--port") {
      result.hasTargetOverride = true;
      nextValue();
    } else if (/^--port=/.test(token) || /^-p.+/.test(token)) {
      result.hasTargetOverride = true;
    } else if (token === "-c" || token === "--command") {
      result.commands.push(nextValue());
    } else if (/^--command=/.test(token)) {
      result.commands.push(token.slice("--command=".length));
    } else if (/^-c.+/.test(token)) {
      result.commands.push(token.slice(2));
    } else if (["-v", "--set", "--variable"].includes(token)) {
      result.hasVariables = true;
      nextValue();
    } else if (/^(?:-v.+|--(?:set|variable)=)/.test(token)) {
      result.hasVariables = true;
    } else if (token === "-f" || token === "--file") {
      result.hasScriptFile = true;
      nextValue();
    } else if (/^--file=.+/.test(token) || /^-f.+/.test(token)) {
      result.hasScriptFile = true;
    } else if (valueOptions.has(token)) {
      nextValue();
    } else if (
      [...valueOptions].some((option) =>
        option.startsWith("--") ? token.startsWith(`${option}=`) : false,
      )
    ) {
      continue;
    } else if (!token.startsWith("-") && result.targets.length === 0) {
      result.targets.push(token);
    }
  }
  return result;
}

const WRITE_SQL =
  /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|vacuum|reindex|copy|merge|call|do|perform|refresh\s+materialized)\b|\bselect\b[\s\S]*\binto\b|\bfor\s+(?:update|no\s+key\s+update|share|key\s+share)\b/i;
const READ_SQL_PREFIX = /^(select|with|show|values|table|explain)\b/i;
const UNSAFE_PSQL_META = /\\[A-Za-z!?]/;

// Production execute_sql is for table/view/catalog reads only. Allow a small
// set of built-in read helpers; block every other function call because a
// SELECT can invoke a VOLATILE function and mutate state.
const SAFE_READ_FUNCTIONS = new Set([
  "array_agg",
  "avg",
  "coalesce",
  "count",
  "greatest",
  "json_agg",
  "jsonb_agg",
  "jsonb_build_array",
  "jsonb_build_object",
  "least",
  "max",
  "md5",
  "min",
  "nullif",
  "pg_get_functiondef",
  "pg_get_viewdef",
  "sum",
  "string_agg",
  "to_regclass",
  "to_regprocedure",
]);
const SQL_PAREN_KEYWORDS = new Set([
  "as",
  "explain",
  "exists",
  "filter",
  "in",
  "over",
  "select",
  "values",
]);

function unsafeSqlFunction(sql) {
  for (const match of stripSqlNoise(sql).matchAll(
    /\b(?:(?:"([^"]+)"|([a-z_][\w$]*))\s*\.\s*)?(?:"([^"]+)"|([a-z_][\w$]*))\s*\(/gi,
  )) {
    const schema = (match[1] ?? match[2])?.toLowerCase();
    const name = (match[3] ?? match[4])?.toLowerCase();
    const quotedName = match[3] !== undefined;
    if (!name || SQL_PAREN_KEYWORDS.has(name)) continue;
    if (schema && schema !== "pg_catalog") return `${schema}.${name}`;
    if (quotedName && schema !== "pg_catalog") return name;
    if (!SAFE_READ_FUNCTIONS.has(name)) return name;
  }
  return null;
}

// WRITE_SQL runs after string literals and comments are stripped, so a write
// keyword inside a quoted value (e.g. `select ... where note = 'do not delete'`)
// is not mistaken for a real write. Dollar-quoted bodies are deliberately NOT
// stripped — a `do $$ ... update ... $$` block is a real write and must match.
function stripSqlNoise(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/'(?:[^']|'')*'/g, "''"); // single-quoted string literals
}

function guardedReadOnlySql(sql) {
  const stripped = stripSqlNoise(sql).trim();
  if (!stripped) return false;
  if (WRITE_SQL.test(stripped) || UNSAFE_PSQL_META.test(stripped)) return false;
  return stripped
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .every((statement) => READ_SQL_PREFIX.test(statement));
}

const DATABASE_CAPABLE_CLIENT =
  /\b(?:supabase|psql|pg_restore|curl|wget|http|https|httpie|xh)\b/i;

function supabaseCliArgs(command) {
  const tokens = shellTokens(command);
  const start = supabaseCommandIndex(tokens);
  if (start === -1) return null;

  let index = start + 1;
  const topLevelReads = new Set(["--help", "-h", "--version", "-v"]);
  const globalValueOptions = new Set([
    "--agent",
    "--dns-resolver",
    "--log-level",
    "--network-id",
    "--output",
    "--output-format",
    "--profile",
    "--workdir",
    "-o",
  ]);
  while (index < tokens.length && tokens[index].startsWith("-")) {
    const token = tokens[index];
    const option = token.split("=", 1)[0];
    if (topLevelReads.has(option)) return [option];
    if (option === "--completions") return ["completion"];
    if (globalValueOptions.has(option) && !token.includes("=")) index += 2;
    else index += 1;
  }
  return tokens.slice(index);
}

function safeSupabaseCliHelp(args) {
  if (!["--help", "-h"].includes(args.at(-1))) return false;
  return !args.slice(2, -1).some((token) => token.startsWith("-"));
}

function localMigrationNew(args) {
  return (
    args.length === 3 &&
    args[0] === "migration" &&
    args[1] === "new" &&
    /^[a-z][a-z0-9_]*$/.test(args[2])
  );
}

function readOnlySupabaseCli(args) {
  if (!args || args.length === 0) return false;
  if (
    safeSupabaseCliHelp(args) ||
    localMigrationNew(args) ||
    [
      "--help",
      "-h",
      "--version",
      "-v",
      "version",
      "help",
      "status",
      "completion",
    ].includes(args[0])
  ) {
    return true;
  }
  return new Set([
    "db diff",
    "db dump",
    "db lint",
    "gen types",
    "inspect db",
    "migration list",
    "projects api-keys",
  ]).has(args.slice(0, 2).join(" "));
}

const PRODUCTION_CLI_VALUE_OPTIONS = {
  "db diff": new Set(["-f", "-s", "--file", "--schema"]),
  "db dump": new Set([
    "-f",
    "-p",
    "-s",
    "-x",
    "--exclude",
    "--file",
    "--password",
    "--schema",
  ]),
  "db lint": new Set(["-s", "--fail-on", "--level", "--schema"]),
  "gen types": new Set(["--lang", "--schema"]),
  "migration list": new Set(["-p", "--password"]),
};
const PRODUCTION_CLI_BOOLEAN_OPTIONS = {
  "db diff": new Set(["--use-migra", "--use-pg-schema"]),
  "db dump": new Set(["--dry-run", "--keep-comments", "--role-only"]),
  "db lint": new Set(),
  "gen types": new Set(["--postgrest-v9-compat"]),
  "migration list": new Set(),
};

function productionSupabaseCliReadAllowed(args) {
  if (unboundSafeSupabaseCli(args)) return true;
  const command = args.slice(0, 2).join(" ");
  const valueOptions = PRODUCTION_CLI_VALUE_OPTIONS[command];
  const booleanOptions = PRODUCTION_CLI_BOOLEAN_OPTIONS[command];
  if (!valueOptions || !booleanOptions) return false;

  for (let index = 2; index < args.length; index += 1) {
    const token = args[index];
    const option = token.split("=", 1)[0];
    if (["--db-url", "--project-ref"].includes(option)) {
      if (!token.includes("=")) index += 1;
      continue;
    }
    if (valueOptions.has(option)) {
      if (!token.includes("=")) index += 1;
      continue;
    }
    if (booleanOptions.has(token)) continue;
    return false;
  }
  return true;
}

function unboundSafeSupabaseCli(args) {
  return (
    safeSupabaseCliHelp(args) ||
    localMigrationNew(args) ||
    ["--help", "-h", "--version", "-v", "version", "help", "completion"].includes(
      args[0],
    )
  );
}

function registeredSupabaseCliTargetRef(args) {
  if (args.some((token) => /^--(?:linked|local)(?:=|$)/.test(token))) {
    return null;
  }
  if (
    args.filter((token) => /^--(?:project-ref|db-url)(?:=|$)/.test(token))
      .length !== 1
  ) {
    return null;
  }

  const projectRefs = supabaseCliFlagValues(args, "--project-ref");
  const databaseUrls = supabaseCliFlagValues(args, "--db-url");
  if (projectRefs.length + databaseUrls.length !== 1) return null;

  if (projectRefs.length === 1) {
    const ref = projectRefs[0];
    return /^[a-z0-9]{20}$/.test(ref) && registeredReadableRef(ref)
      ? ref
      : null;
  }
  return registeredDatabaseUrlRef(databaseUrls[0]);
}

const HTTP_CLIENT_NAMES = new Set([
  "curl",
  "wget",
  "http",
  "https",
  "httpie",
  "xh",
]);
const DATABASE_CLIENT_NAMES = new Set([
  ...HTTP_CLIENT_NAMES,
  "psql",
  "pg_restore",
]);

function databaseClient(command) {
  const tokens = shellTokens(command);
  const supabaseIndex = supabaseCommandIndex(tokens);
  if (supabaseIndex !== -1) {
    return {
      basename: commandTokenBasename(tokens[supabaseIndex]),
      index: supabaseIndex,
    };
  }
  const index = directCommandIndex(tokens);
  const basename = commandTokenBasename(tokens[index]);
  return DATABASE_CLIENT_NAMES.has(basename) ? { basename, index } : null;
}

function supabaseHttpBinding(command) {
  const targets = httpRequestTargets(command);
  const refs = [];
  let scopedTargets = 0;

  for (const target of targets) {
    if (!/supabase\.(?:co|com)\b/i.test(target)) continue;
    scopedTargets += 1;
    const targetRefs = [
      ...target.matchAll(
        /\b(?:db\.)?([a-z0-9]{20})\.supabase\.co\b/gi,
      ),
      ...target.matchAll(
        /\bapi\.supabase\.com\/[^\s"']*?\/projects\/([a-z0-9]{20})(?:[/?#\s"']|$)/gi,
      ),
      ...target.matchAll(/\bproject_ref=([a-z0-9]{20})(?:[&#\s"']|$)/gi),
    ].map((match) => match[1].toLowerCase());
    const uniqueTargetRefs = [...new Set(targetRefs)];
    if (
      uniqueTargetRefs.length !== 1 ||
      !registeredReadableRef(uniqueTargetRefs[0])
    ) {
      return { scoped: true, ref: null };
    }
    refs.push(uniqueTargetRefs[0]);
  }

  if (scopedTargets === 0) return { scoped: false, ref: null };
  const uniqueRefs = [...new Set(refs)];
  return {
    scoped: true,
    ref:
      scopedTargets === targets.length && uniqueRefs.length === 1
        ? uniqueRefs[0]
        : null,
  };
}

function productionHttpCatalogRead(command, ref) {
  const targets = httpRequestTargets(command).filter((target) =>
    /supabase\.(?:co|com)\b/i.test(target),
  );
  if (targets.length === 0) return false;

  return targets.every((target) => {
    try {
      const url = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(target)
          ? target
          : `https://${target}`,
      );
      if (url.hostname.toLowerCase() !== `${ref}.supabase.co`) return false;
      if (url.pathname === "/rest/v1") return true;
      if (!url.pathname.startsWith("/rest/v1/")) return false;
      const resource = url.pathname.slice("/rest/v1/".length);
      return (
        resource === "" ||
        (/^[A-Za-z_][A-Za-z0-9_$-]*$/.test(resource) &&
          resource.toLowerCase() !== "rpc")
      );
    } catch {
      return false;
    }
  });
}

const CURL_SHORT_VALUE_OPTIONS = new Set([
  "A",
  "b",
  "c",
  "C",
  "d",
  "D",
  "e",
  "E",
  "F",
  "h",
  "H",
  "K",
  "m",
  "o",
  "P",
  "Q",
  "r",
  "t",
  "T",
  "u",
  "U",
  "w",
  "x",
  "X",
  "y",
  "Y",
  "z",
]);

const CURL_LONG_VALUE_OPTIONS = new Set([
  "--cacert",
  "--capath",
  "--cert",
  "--connect-timeout",
  "--cookie",
  "--cookie-jar",
  "--dump-header",
  "--header",
  "--key",
  "--limit-rate",
  "--max-time",
  "--output",
  "--proxy",
  "--range",
  "--referer",
  "--resolve",
  "--retry",
  "--url",
  "--user",
  "--user-agent",
  "--write-out",
]);

function containsShellParameter(value) {
  return /\$(?:\{[^}\r\n]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!$-])/.test(
    String(value),
  );
}

function unverifiedTargetHeader(value) {
  const header = String(value).trim();
  return (
    header.startsWith("@") ||
    (header.startsWith("$") && containsShellParameter(header)) ||
    /^(?:host|:authority)\s*:/i.test(header)
  );
}

function curlShortWriteIntent(token, nextToken, safeMethods) {
  if (!/^-[^-]/.test(token)) {
    return { consumesNext: false, writes: false };
  }

  const options = token.slice(1);
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (["d", "F", "K", "T"].includes(option)) {
      return { consumesNext: index === options.length - 1, writes: true };
    }
    if (option === "X") {
      const attachedMethod = options.slice(index + 1);
      const method = attachedMethod || nextToken || "";
      return {
        consumesNext: attachedMethod === "",
        writes: !safeMethods.has(method.toUpperCase()),
      };
    }
    if (option === "H") {
      const attachedHeader = options.slice(index + 1);
      const header = attachedHeader || nextToken || "";
      return {
        consumesNext: attachedHeader === "",
        writes: unverifiedTargetHeader(header),
      };
    }
    if (CURL_SHORT_VALUE_OPTIONS.has(option)) {
      return {
        consumesNext: index === options.length - 1,
        writes: false,
      };
    }
  }
  return { consumesNext: false, writes: false };
}

function curlWriteIntent(args, safeMethods) {
  // curl reads user-controlled default config unless disable is the first
  // parameter. Protected reads must make that hidden input impossible.
  if (args[0] !== "-q" && args[0] !== "--disable") return true;

  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const token = args[cursor];
    if (token.startsWith("--expand-")) return true;
    if (
      /^(?:--data|--data-ascii|--data-raw|--data-binary|--data-urlencode|--json|--form|--form-string|--upload-file)(?:=|$)/.test(
        token,
      )
    ) {
      return true;
    }
    if (
      token === "--config" ||
      token.startsWith("--config=") ||
      token === "--no-disable"
    ) {
      return true;
    }
    if (token === "--request") {
      const method = args[cursor + 1] ?? "";
      if (!safeMethods.has(method.toUpperCase())) return true;
      cursor += 1;
      continue;
    }
    const methodMatch = token.match(/^--request=(.+)$/);
    if (methodMatch) {
      if (!safeMethods.has(methodMatch[1].toUpperCase())) return true;
      continue;
    }
    if (token === "--header") {
      if (unverifiedTargetHeader(args[cursor + 1] ?? "")) return true;
      cursor += 1;
      continue;
    }
    const headerMatch = token.match(/^--header=(.*)$/);
    if (headerMatch) {
      if (unverifiedTargetHeader(headerMatch[1])) return true;
      continue;
    }
    if (CURL_LONG_VALUE_OPTIONS.has(token)) {
      cursor += 1;
      continue;
    }

    const shortIntent = curlShortWriteIntent(
      token,
      args[cursor + 1],
      safeMethods,
    );
    if (shortIntent.writes) return true;
    if (shortIntent.consumesNext) cursor += 1;
  }
  return false;
}

const WGET_SHORT_VALUE_OPTIONS = new Set([
  "a",
  "A",
  "B",
  "D",
  "I",
  "i",
  "l",
  "o",
  "O",
  "P",
  "Q",
  "R",
  "T",
  "t",
  "U",
  "w",
  "X",
]);

const HTTP_NON_TARGET_VALUE_OPTIONS = new Set([
  "--auth",
  "--cert",
  "--cert-key",
  "--connect-to",
  "--directory-prefix",
  "--header",
  "--method",
  "--output",
  "--output-document",
  "--proxy",
  "--proxy-user",
  "--resolve",
  "--session",
  "--session-read-only",
  "--user",
  "-H",
  "-O",
  "-P",
  "-a",
  "-o",
  "-u",
  "-x",
]);

function httpRequestTargets(command) {
  const tokens = shellTokens(command);
  const detectedClient = databaseClient(command);
  if (!detectedClient || !HTTP_CLIENT_NAMES.has(detectedClient.basename)) {
    return [];
  }
  const clientIndex = detectedClient.index;
  const client = detectedClient.basename;
  const args = tokens.slice(clientIndex + 1);
  const targets = [];
  let positionalOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") {
      positionalOnly = true;
      continue;
    }

    if (client === "curl" && !positionalOnly) {
      if (token === "--url") {
        targets.push(args[++index] ?? "");
        continue;
      }
      if (token.startsWith("--url=")) {
        targets.push(token.slice("--url=".length));
        continue;
      }
      const longOption = token.split("=", 1)[0];
      if (CURL_LONG_VALUE_OPTIONS.has(longOption)) {
        if (!token.includes("=")) index += 1;
        continue;
      }
      if (/^-[^-]/.test(token)) {
        const intent = curlShortWriteIntent(
          token,
          args[index + 1],
          new Set(["GET", "HEAD", "OPTIONS"]),
        );
        if (intent.consumesNext) index += 1;
        continue;
      }
      if (token.startsWith("--")) continue;
    } else if (client === "wget" && !positionalOnly) {
      const longOption = token.split("=", 1)[0];
      if (HTTP_NON_TARGET_VALUE_OPTIONS.has(longOption)) {
        if (!token.includes("=")) index += 1;
        continue;
      }
      if (/^-[^-]/.test(token)) {
        const options = token.slice(1);
        const valueIndex = [...options].findIndex((option) =>
          WGET_SHORT_VALUE_OPTIONS.has(option),
        );
        if (valueIndex === options.length - 1) index += 1;
        continue;
      }
      if (token.startsWith("--")) continue;
    } else if (
      ["http", "https", "httpie", "xh"].includes(client) &&
      !positionalOnly
    ) {
      if (/^(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/i.test(token)) {
        continue;
      }
      const longOption = token.split("=", 1)[0];
      if (HTTP_NON_TARGET_VALUE_OPTIONS.has(longOption)) {
        if (!token.includes("=")) index += 1;
        continue;
      }
      if (token.startsWith("-")) continue;
      if (
        !token.includes("://") &&
        (/^[^:=@]+(?::|=|@)/.test(token) || token.startsWith("@"))
      ) {
        continue;
      }
    }

    targets.push(token);
  }
  return targets;
}

function unresolvedHttpTarget(command) {
  return httpRequestTargets(command).some((target) =>
    containsShellParameter(target),
  );
}

function wgetIndirectConfig(args) {
  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const token = args[cursor];
    if (
      token === "--config" ||
      token.startsWith("--config=") ||
      token === "--input-file" ||
      token.startsWith("--input-file=") ||
      token === "--execute" ||
      token.startsWith("--execute=")
    ) {
      return true;
    }
    if (!/^-[^-]/.test(token)) continue;

    const options = token.slice(1);
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "e" || option === "i") return true;
      if (WGET_SHORT_VALUE_OPTIONS.has(option)) {
        if (index === options.length - 1) cursor += 1;
        break;
      }
    }
  }
  return false;
}

function httpWriteIntent(command) {
  const tokens = shellTokens(command);
  const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  for (let index = 0; index < tokens.length; index += 1) {
    const client = tokens[index].split("/").at(-1);
    if (client === "curl") {
      if (curlWriteIntent(tokens.slice(index + 1), safeMethods)) return true;
    }
    if (client === "wget") {
      const wgetArgs = tokens.slice(index + 1);
      const configDisabled = wgetArgs.includes("--no-config");
      const indirectStartupConfig = tokens
        .slice(0, index)
        .some((token) => /^WGETRC=.+/.test(token));
      if (
        !configDisabled ||
        indirectStartupConfig ||
        wgetIndirectConfig(wgetArgs) ||
        wgetArgs.some(
          (token, cursor) =>
            /^(?:--post-data|--post-file|--body-data|--body-file)(?:=|$)|^--method=(?!GET$|HEAD$|OPTIONS$)/i.test(
              token,
            ) ||
            (token === "--header" &&
              unverifiedTargetHeader(wgetArgs[cursor + 1] ?? "")) ||
            (/^--header=/.test(token) &&
              unverifiedTargetHeader(token.slice("--header=".length))) ||
            (token === "--method" &&
              !safeMethods.has((wgetArgs[cursor + 1] ?? "").toUpperCase())),
        )
      ) {
        return true;
      }
    }
    if (["http", "https", "httpie", "xh"].includes(client)) {
      const clientArgs = tokens.slice(index + 1);
      const ignoresStdin =
        !clientArgs.includes("--no-ignore-stdin") &&
        (clientArgs.includes("--ignore-stdin") ||
          (client === "xh" && clientArgs.includes("-I")));
      const method = clientArgs
        .find((token) =>
          /^(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/i.test(token),
        )
        ?.toUpperCase();
      if (method && writeMethods.has(method)) return true;
      if (method && !safeMethods.has(method)) return true;
      if (
        clientArgs.some(
          (token) =>
            token === "--raw" ||
            token.startsWith("--raw=") ||
            token.startsWith("@") ||
            unverifiedTargetHeader(token),
        )
      ) {
        return true;
      }
      if (clientArgs.some((token) => /^[^:=@]+(?::=|=|@)(?!=)/.test(token))) {
        return true;
      }
      if (!ignoresStdin) return true;
    }
  }
  return false;
}

const MCP_PROJECT_READ_ACTIONS = new Set([
  "generate_typescript_types",
  "get_advisors",
  "get_edge_function",
  "get_logs",
  "get_project",
  "get_project_url",
  "get_publishable_keys",
  "list_branches",
  "list_edge_functions",
  "list_extensions",
  "list_migrations",
  "list_tables",
]);
const MCP_UNSCOPED_SAFE_ACTIONS = new Set(["search_docs"]);
const MCP_PRODUCTION_READ_ACTIONS = new Set([
  "generate_typescript_types",
  "list_extensions",
  "list_migrations",
  "list_tables",
]);
const MCP_PROJECT_BOUND_ACTIONS = new Set([
  ...MCP_PROJECT_READ_ACTIONS,
  "apply_migration",
  "create_branch",
  "delete_branch",
  "deploy_edge_function",
  "execute_sql",
  "pause_project",
  "restore_project",
  "update_storage_config",
]);

// Route every current or future Supabase MCP action through the guard. Known
// docs/project reads are allowed below; unknown actions fail closed.
const MCP_GUARDED_TOOL =
  /^mcp__(?:supabase|.+?(?:__|[._]+)supabase)(?:__|[._]+)([A-Za-z0-9_-]+)$/;

function block(reason) {
  console.error(
    [
      `[guard-prod-db] BLOCKED: ${reason}`,
      "Environment Registry (docs/agent/rules/database.md): enloyfnuerqgaqderbwb is the CTCP Chén Sứ Production target;",
      "Production writes and migration applies require exact owner delegation.",
      "Never disable this hook or its",
      "runtime wiring.",
    ].join("\n"),
  );
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  block("unreadable hook input");
}
if (
  !input ||
  typeof input !== "object" ||
  typeof input.tool_name !== "string" ||
  input.tool_name === "" ||
  !input.tool_input ||
  typeof input.tool_input !== "object" ||
  Array.isArray(input.tool_input)
) {
  block("malformed hook input");
}

const toolName = String(input.tool_name ?? "");
const toolInput = input.tool_input ?? {};

if (toolName === "Bash") {
  if (typeof toolInput.command !== "string") {
    block("malformed Bash hook input");
  }
  const cmd = String(toolInput.command ?? "").replace(/\\\r?\n/g, " ");
  const segments = shellSegments(cmd);
  const commandLibpqOverride = segments
    .flatMap((segment) => shellTokens(segment))
    .map((token) => token.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .find((name) => LIBPQ_UNVERIFIED_ENV.includes(name));
  const dynamicShell =
    hasUnquotedShellGrouping(cmd) ||
    hasUnquotedShellInput(cmd) ||
    segments.some(
      (segment) =>
        hasDynamicRunnerComposition(segment) ||
        hasDynamicShellInvocation(segment) ||
        hasUnquotedDynamicExpansion(segment),
    );
  const allowPreviewTarget = segments.length === 1 && !dynamicShell;
  if (dynamicShell && DATABASE_CAPABLE_CLIENT.test(cmd)) {
    block("dynamic shell composition around a database-capable command");
  }
  const hasLibpqClient = segments.some((segment) =>
    ["psql", "pg_restore"].includes(databaseClient(segment)?.basename),
  );
  if (commandLibpqOverride && hasLibpqClient) {
    block(`shell command sets unverified libpq option ${commandLibpqOverride}`);
  }

  for (const segment of segments) {
    const detectedDatabaseClient = databaseClient(segment);
    const segmentTokens = shellTokens(segment);
    const cliCommandIndex = supabaseCommandIndex(segmentTokens);
    const cliCommandName =
      cliCommandIndex === -1
        ? ""
        : commandTokenBasename(segmentTokens[cliCommandIndex]);
    const cliArgs = supabaseCliArgs(segment);
    if (cliArgs) {
      if (cliCommandName.startsWith("supabase@")) {
        block("version-qualified Supabase CLI is not repository-pinned");
      }
      const isReadOnly = readOnlySupabaseCli(cliArgs);
      const isUnboundSafe = unboundSafeSupabaseCli(cliArgs);
      const isDbPush = cliArgs[0] === "db" && cliArgs[1] === "push";
      const isPreviewCreate =
        cliArgs[0] === "branches" && cliArgs[1] === "create";
      const dbUrls = supabaseCliFlagValues(cliArgs, "--db-url");
      const previewParentRefs = supabaseCliFlagValues(
        cliArgs,
        "--project-ref",
      );
      const readTargetRef = registeredSupabaseCliTargetRef(cliArgs);
      const hasCompetingCliTarget = cliArgs.slice(2).some((token) =>
        /^--(?:linked|local)(?:=|$)/.test(token),
      );
      const hasUnresolvedDbUrl = dbUrls.some(
        (url) => containsShellParameter(url) || url.includes("`"),
      );
      const cliTargetsWritable =
        allowPreviewTarget &&
        isDbPush &&
        !hasUnresolvedDbUrl &&
        !hasCompetingCliTarget &&
        dbUrls.length === 1 &&
        readTargetRef !== null &&
        (REGISTERED_WRITE_REFS.has(readTargetRef) ||
          trustedPreviewProject(readTargetRef) !== null);

      if (isReadOnly) {
        if (!isUnboundSafe && !readTargetRef) {
          block("Supabase CLI read without one literal registered target");
        }
        if (
          readTargetRef === APPROVED_PREVIEW_PARENT_REF &&
          !productionSupabaseCliReadAllowed(cliArgs)
        ) {
          block("Supabase CLI read outside the Production schema/catalog allowlist");
        }
      } else if (isPreviewCreate) {
        if (
          !allowPreviewTarget ||
          /[`$]/.test(segment) ||
          hasCompetingCliTarget ||
          readTargetRef !== APPROVED_PREVIEW_PARENT_REF ||
          previewParentRefs.length !== 1 ||
          previewParentRefs[0] !== APPROVED_PREVIEW_PARENT_REF
        ) {
          block("Preview branch creation without the registered parent ref");
        }
      } else if (isDbPush) {
        if (!cliTargetsWritable) {
          block(
            "Supabase db push without a verified Preview Branch or registered Production target",
          );
        }
      } else {
        block("Supabase CLI command outside the guarded read-only allowlist");
      }
    }

    const psql = parsePsql(segment);

    if (detectedDatabaseClient?.basename === "pg_restore") {
      block("pg_restore is always a database write");
    }

    if (psql && !psql.isHelp) {
      if (hasActiveShellExpansion(segment)) {
        block("psql command contains unresolved shell interpolation");
      }
      const inheritedOverride = inheritedLibpqTargetOverride();
      const psqlTargetRef =
        !inheritedOverride &&
        !psql.hasOptionTerminator &&
        !psql.hasTargetOverride &&
        psql.targets.length === 1
          ? registeredDatabaseUrlRef(psql.targets[0])
          : null;
      if (!psqlTargetRef) {
        const cause = inheritedOverride
          ? `inherited ${inheritedOverride}`
          : "an indirect, overridden, or unregistered target";
        block(`psql without a verified registered target (${cause})`);
      }
      if (!psql.startupFilesDisabled) {
        block("psql startup files must be disabled with -X or --no-psqlrc");
      }

      const unsafeFunction = psql.commands
        .map((sql) => unsafeSqlFunction(sql))
        .find(Boolean);
      const guardedRead =
        psql.startupFilesDisabled &&
        psql.commands.length > 0 &&
        !psql.hasScriptFile &&
        psql.commands.every((sql) => guardedReadOnlySql(sql)) &&
        !unsafeFunction;
      const guardedPreviewCommand =
        psql.commands.length > 0 &&
        !psql.hasScriptFile &&
        !psql.hasVariables &&
        psql.commands.every(
          (sql) => !UNSAFE_PSQL_META.test(stripSqlNoise(sql)),
        );

      if (
        psqlTargetRef === APPROVED_PREVIEW_PARENT_REF &&
        (!guardedRead || psql.hasVariables)
      ) {
        block(
          unsafeFunction
            ? `psql calling non-whitelisted function ${unsafeFunction}() against Production`
            : psql.hasVariables
              ? "psql variables are unverified SQL input against Production"
            : "psql against Production without a verified read-only command",
        );
      }
      if (
        psqlTargetRef !== APPROVED_PREVIEW_PARENT_REF &&
        (!allowPreviewTarget ||
          trustedPreviewProject(psqlTargetRef) === null ||
          !guardedPreviewCommand)
      ) {
        block(
          "Preview psql requires a verified branch and static literal -c input without variables or meta-commands",
        );
      }
    }

    if (HTTP_CLIENT_NAMES.has(detectedDatabaseClient?.basename)) {
      if (unresolvedHttpTarget(segment)) {
        block("HTTP request contains an unresolved positional target");
      }
      const httpBinding = supabaseHttpBinding(segment);
      if (httpBinding.scoped && !httpBinding.ref) {
        block("Supabase HTTP request without one literal registered target");
      }
      if (
        httpBinding.ref === APPROVED_PREVIEW_PARENT_REF &&
        !productionHttpCatalogRead(segment, httpBinding.ref)
      ) {
        block("Production HTTP read outside the table/view REST allowlist");
      }
      if (httpBinding.ref && httpWriteIntent(segment)) {
        block(
          `HTTP write or request with unverified client config/stdin toward registered ref ${httpBinding.ref}`,
        );
      }
    }
  }
  process.exit(0);
}

const mcpMatch = toolName.match(MCP_GUARDED_TOOL);
if (mcpMatch) {
  const action = mcpMatch[1];
  if (MCP_UNSCOPED_SAFE_ACTIONS.has(action)) {
    process.exit(0);
  }
  const branchActions = [
    "delete_branch",
    "merge_branch",
    "reset_branch",
    "rebase_branch",
  ];
  if (
    branchActions.includes(action) &&
    (typeof toolInput.branch_id !== "string" ||
      toolInput.branch_id.trim() === "")
  ) {
    block(`malformed ${action} branch ref`);
  }
  if (branchActions.includes(action)) {
    if (action !== "delete_branch") {
      block(`${action} is never allowed against a Preview branch`);
    }
    if (!trustedPreviewBranch(toolInput.branch_id.trim())) {
      block("Preview branch deletion without a verified Production parent");
    }
    process.exit(0);
  }

  const projectFieldNames =
    action === "get_project"
      ? ["project_id", "ref", "id"]
      : ["project_id", "ref"];
  const projectFields = projectFieldNames
    .filter((field) => Object.hasOwn(toolInput, field))
    .map((field) => toolInput[field]);
  if (projectFields.some((value) => typeof value !== "string")) {
    block(`malformed ${action} project ref`);
  }
  if (
    projectFields.length > 1 &&
    projectFields.some((value) => value !== projectFields[0])
  ) {
    block(`conflicting ${action} project refs`);
  }
  const directProjectScopedTool = /^mcp__supabase__/.test(toolName);
  const pinnedCodexProjectTool =
    directProjectScopedTool &&
    !process.env.CLAUDE_PROJECT_DIR &&
    codexSupabaseBindingVerified();
  if (
    projectFields.length === 0 &&
    MCP_PROJECT_BOUND_ACTIONS.has(action) &&
    (!pinnedCodexProjectTool ||
      action === "create_branch" ||
      action === "delete_branch" ||
      (action !== "execute_sql" && !MCP_PROJECT_READ_ACTIONS.has(action)))
  ) {
    block(`${action} without an explicit project ref`);
  }
  const rawProjectId = projectFields[0] ?? "";
  const projectId = rawProjectId;
  // Only a direct Codex repo server with a currently verified config may omit
  // project_id. Claude/plugin and connector-wrapped tools are org-scoped and
  // must always carry an explicit project ref.
  const target = projectId === "" ? "enloyfnuerqgaqderbwb" : projectId;
  const label = Object.hasOwn(PROTECTED_REFS, target)
    ? PROTECTED_REFS[target]
    : undefined;
  const registeredWriteTarget = REGISTERED_WRITE_REFS.has(target);
  const preview = !label ? trustedPreviewProject(target) : null;
  const approvedTarget = registeredWriteTarget || preview !== null;
  if (!approvedTarget && !label) {
    block(`${action} against unregistered Supabase ref ${target}`);
  }

  let executeQuery = "";
  if (action === "execute_sql") {
    const queryFields = ["query", "sql"].filter((field) =>
      Object.hasOwn(toolInput, field),
    );
    if (queryFields.length !== 1) {
      block("execute_sql requires exactly one query string");
    }
    const queryValue = toolInput[queryFields[0]];
    if (typeof queryValue !== "string" || queryValue.trim() === "") {
      block("execute_sql requires a non-empty query string");
    }
    executeQuery = queryValue;
  }

  if (action === "create_branch") {
    if (target !== APPROVED_PREVIEW_PARENT_REF) {
      block(`Preview branch creation against an unapproved parent ${target}`);
    }
    process.exit(0);
  }

  if (MCP_PROJECT_READ_ACTIONS.has(action)) {
    if (
      preview !== null ||
      (label && MCP_PRODUCTION_READ_ACTIONS.has(action))
    ) {
      process.exit(0);
    }
    block(`${action} is outside the Production database catalog read allowlist`);
  }

  if (registeredWriteTarget) {
    if (action === "apply_migration") {
      process.exit(0);
    }
    if (action === "execute_sql") {
      if (!guardedReadOnlySql(executeQuery)) {
        block("execute_sql write against the registered Production target");
      }
      const unsafeFunction = unsafeSqlFunction(executeQuery);
      if (unsafeFunction) {
        block(
          `execute_sql calling non-whitelisted function ${unsafeFunction}() against the registered Production target`,
        );
      }
      process.exit(0);
    }
    block(`${action} against the registered Production target`);
  }

  if (preview !== null) {
    if (
      action === "apply_migration" ||
      action === "execute_sql" ||
      action === "deploy_edge_function"
    ) {
      process.exit(0);
    }
    block(
      `${action} against an approved writable target`,
    );
  }

  if (action === "execute_sql") {
    if (!guardedReadOnlySql(executeQuery)) {
      block(`execute_sql outside guarded read-only SQL against ${label}`);
    }
    const unsafeFunction = unsafeSqlFunction(executeQuery);
    if (unsafeFunction) {
      block(
        `execute_sql calling non-whitelisted function ${unsafeFunction}() against ${label}`,
      );
    }
    process.exit(0); // guarded table/view/catalog reads on a protected ref are allowed
  }
  block(`${action} against ${label}`);
}

block(`unsupported hook tool ${toolName}`);

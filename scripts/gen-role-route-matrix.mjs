import fs from "node:fs";
import path from "node:path";

// Generates the GENERATED body of docs/spec/role-route-matrix.md from the
// auth source-of-truth files (module-acl.ts, route-map.ts, nav-config.ts,
// scope.ts, branch-hub.ts, types.ts, permissions.ts). The doc's hand-authored
// prose (product frame, principles, scope layers, navigation contract, change
// checklist) lives in a preamble the generator reads verbatim from the
// existing file and re-emits unchanged — only the block between the
// GENERATED markers is replaced.
//
// Parsing follows the text-scrape convention already used by
// scripts/check-ui-contract.mjs (MODULE_ACL_SOURCE regex reads) rather than
// importing TypeScript at runtime — this is a plain Node script with no
// TS loader in the toolchain.

const REPO_ROOT = process.cwd();
const DOC_PATH = "docs/spec/role-route-matrix.md";
const CHECK_MODE = process.argv.includes("--check");

const MODULE_ACL_PATH = "packages/shared/src/auth/module-acl.ts";
const ROUTE_MAP_PATH = "packages/shared/src/auth/route-map.ts";
const NAV_CONFIG_PATH = "packages/shared/src/auth/nav-config.ts";
const SCOPE_PATH = "packages/shared/src/auth/scope.ts";
const BRANCH_HUB_PATH = "packages/shared/src/auth/branch-hub.ts";
const TYPES_PATH = "packages/shared/src/auth/types.ts";
const PERMISSIONS_PATH = "packages/shared/src/auth/permissions.ts";

const GENERATED_BEGIN = "<!-- GENERATED:role-route-matrix:begin -->";
const GENERATED_END = "<!-- GENERATED:role-route-matrix:end -->";

function readSource(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// Parse packages/shared/src/auth/types.ts
// ---------------------------------------------------------------------------

function parseAccessBuckets(source) {
  const block = source.match(
    /export const ACCESS_BUCKETS = \[([\s\S]*?)\] as const;/,
  );
  if (!block) throw new Error("types.ts: could not find ACCESS_BUCKETS");
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function parseRoleLabels(source) {
  const block = source.match(
    /export const ROLE_LABEL_VI: Record<StaffRole, string> = \{([\s\S]*?)\};/,
  );
  if (!block) throw new Error("types.ts: could not find ROLE_LABEL_VI");
  const labels = {};
  for (const m of block[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
    labels[m[1]] = m[2];
  }
  return labels;
}

function parseCentralSiteRoleBranchKinds(source) {
  const block = source.match(
    /const CENTRAL_SITE_ROLE_BRANCH_KINDS: Partial<Record<StaffRole, BranchKind>> = \{([\s\S]*?)\};/,
  );
  if (!block) {
    throw new Error(
      "types.ts: could not find CENTRAL_SITE_ROLE_BRANCH_KINDS",
    );
  }
  const kinds = {};
  for (const m of block[1].matchAll(/(\w+):\s*"([a-z_]+)"/g)) {
    kinds[m[1]] = m[2];
  }
  return kinds;
}

// ---------------------------------------------------------------------------
// Parse packages/shared/src/auth/module-acl.ts
// ---------------------------------------------------------------------------

/**
 * `allowedRoles` is either an inline string-literal array or a reference to a
 * named role-set constant declared above MODULE_ACL in the same file
 * (currently only `EMPLOYEE_PORTAL_ROLES`, itself `STAFF_ROLES.filter(role
 * => !ADMIN_ROLES.includes(role))`). Resolve named references against the
 * accessBuckets/adminRoles already parsed from types.ts so a role subset
 * change in either file cannot silently drop out of the generated table.
 */
function resolveNamedRoleSet(name, accessBuckets, adminRoles) {
  if (name === "STAFF_ROLES") return accessBuckets;
  if (name === "EMPLOYEE_PORTAL_ROLES") {
    return accessBuckets.filter((role) => !adminRoles.includes(role));
  }
  throw new Error(
    `module-acl.ts: allowedRoles references unknown named role set "${name}" — teach resolveNamedRoleSet about it.`,
  );
}

function parseModuleAcl(source, accessBuckets, adminRoles) {
  const block = source.match(
    /export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = \{([\s\S]*?)\n\};/,
  );
  if (!block) throw new Error("module-acl.ts: could not find MODULE_ACL");

  const body = block[1];
  const entries = [];
  // Split on top-level `key: {` ... `},` blocks by scanning brace depth.
  const entryRegex = /(\w+):\s*\{/g;
  let match;
  while ((match = entryRegex.exec(body)) !== null) {
    const key = match[1];
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (depth > 0 && i < body.length) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      i++;
    }
    const entryBody = body.slice(start, i - 1);
    const pathMatch = entryBody.match(/path:\s*"([^"]+)"/);
    const rolesMatch = entryBody.match(/allowedRoles:\s*(\[[\s\S]*?\]|\w+)/);
    if (!pathMatch) continue;
    let roles = [];
    if (rolesMatch) {
      if (rolesMatch[1].startsWith("[")) {
        roles = [...rolesMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      } else {
        roles = resolveNamedRoleSet(rolesMatch[1], accessBuckets, adminRoles);
      }
    }
    entries.push({ key, path: pathMatch[1], allowedRoles: roles });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Parse packages/shared/src/auth/route-map.ts
// ---------------------------------------------------------------------------

/**
 * Extract a `fieldName: [ ... ]` array literal's inner text, scanning for the
 * matching close bracket rather than a lazy regex — route-map path literals
 * like "/br/[branchId]/pos" contain a `]` inside the string, which a naive
 * `\[([\s\S]*?)\]` stops at prematurely.
 */
function extractArrayField(text, fieldName) {
  const marker = `${fieldName}:`;
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  const openIndex = text.indexOf("[", markerIndex);
  if (openIndex === -1) return null;

  let depth = 1;
  let i = openIndex + 1;
  let inString = null;
  while (depth > 0 && i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
    } else if (ch === '"' || ch === "'") {
      inString = ch;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    }
    i++;
  }
  return text.slice(openIndex + 1, i - 1);
}

/**
 * Route-map entries reference paths either as inline string literals
 * ("/br/[branchId]/pos") or as `MODULE_ACL.<key>.path`/`MODULE_ACL.<key>.label`
 * lookups. Resolve every occurrence of the latter against the already-parsed
 * MODULE_ACL table so the generated doc never prints a raw code token.
 */
function resolveModuleAclTokens(fragment, moduleAclByKey) {
  return [...fragment.matchAll(/MODULE_ACL\.(\w+)\.path|"([^"]+)"/g)].map(
    (m) => {
      if (m[2] !== undefined) return m[2];
      const acl = moduleAclByKey[m[1]];
      if (!acl) {
        throw new Error(
          `route-map.ts: MODULE_ACL.${m[1]}.path has no matching MODULE_ACL entry`,
        );
      }
      return acl.path;
    },
  );
}

function parseRouteFamilyContracts(source, moduleAclByKey) {
  const block = source.match(
    /export const ROUTE_FAMILY_CONTRACTS = \[([\s\S]*?)\] as const satisfies/,
  );
  if (!block) {
    throw new Error("route-map.ts: could not find ROUTE_FAMILY_CONTRACTS");
  }
  const body = block[1];
  const entryRegex = /\{\s*(?:\/\/[^\n]*\n\s*)*id:\s*"([\w-]+)",/g;
  const families = [];
  let match;
  while ((match = entryRegex.exec(body)) !== null) {
    const start = match.index;
    // Find the matching closing brace for this object literal.
    const objStart = body.indexOf("{", start);
    let depth = 1;
    let i = objStart + 1;
    while (depth > 0 && i < body.length) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
      i++;
    }
    const entryBody = body.slice(objStart, i);
    const id = match[1];
    const surfaceMatch = entryBody.match(/surface:\s*"([\w]+)"/);
    const entryPathMatch = entryBody.match(
      /entryPath:\s*(MODULE_ACL\.\w+\.path|"[^"]+")/,
    );
    const matchPrefixesField = extractArrayField(entryBody, "matchPrefixes");
    const moduleKeysField = extractArrayField(entryBody, "moduleKeys");
    const requiresBranchIdMatch = entryBody.match(
      /requiresBranchId:\s*(true|false)/,
    );

    const matchPrefixes =
      matchPrefixesField !== null
        ? resolveModuleAclTokens(matchPrefixesField, moduleAclByKey)
        : [];
    const moduleKeys =
      moduleKeysField !== null
        ? [...moduleKeysField.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
        : [];
    const entryPath = entryPathMatch
      ? resolveModuleAclTokens(entryPathMatch[1], moduleAclByKey)[0]
      : "";

    families.push({
      id,
      surface: surfaceMatch ? surfaceMatch[1] : "",
      entryPath,
      matchPrefixes,
      moduleKeys,
      requiresBranchId: requiresBranchIdMatch
        ? requiresBranchIdMatch[1] === "true"
        : false,
    });
  }
  return families;
}

// ---------------------------------------------------------------------------
// Parse packages/shared/src/auth/nav-config.ts — advertisement source per
// module key (which nav/tile arrays surface a module to the user).
// ---------------------------------------------------------------------------

function parseNavAdvertisementSources(source) {
  const sources = {}; // moduleKey -> Set<sourceLabel>

  function addSource(moduleKey, label) {
    if (!sources[moduleKey]) sources[moduleKey] = new Set();
    sources[moduleKey].add(label);
  }

  const namedArrays = [
    { name: "ADMIN_NAV_GROUPS", label: "Admin sidebar" },
    { name: "DOMAIN_WORKSPACE_ITEMS", label: "Workspace nav" },
    { name: "BRANCH_MANAGEMENT_ITEMS", label: "Branch management nav" },
    { name: "BRANCH_OPERATION_ITEMS", label: "Branch operation nav" },
  ];

  for (const { name, label } of namedArrays) {
    const arrayMatch = source.match(
      new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`),
    );
    if (!arrayMatch) continue;
    for (const m of arrayMatch[1].matchAll(/moduleKey:\s*"(\w+)"/g)) {
      addSource(m[1], label);
    }
  }

  // Operator tiles carry a group id; label each occurrence with its group.
  const tileBlock = source.match(
    /export const OPERATOR_TILE_ITEMS = \[([\s\S]*?)\n\] satisfies/,
  );
  if (tileBlock) {
    const entryRegex = /\{([\s\S]*?)\},?\n(?=\s*\{|\s*\])/g;
    let match;
    while ((match = entryRegex.exec(tileBlock[1])) !== null) {
      const entry = match[1];
      const moduleKeyMatch = entry.match(/moduleKey:\s*"(\w+)"/);
      const groupMatch = entry.match(/group:\s*"(\w+)"/);
      if (moduleKeyMatch && groupMatch) {
        addSource(
          moduleKeyMatch[1],
          `Operator tile (${groupMatch[1]})`,
        );
      }
    }
  }

  return sources;
}

// ---------------------------------------------------------------------------
// Parse packages/shared/src/auth/permissions.ts — action-gate keys grouped by
// their comment-declared module prefix, matched against a route family's
// permission-key namespace (e.g. "pos" -> pos:*).
// ---------------------------------------------------------------------------

function parsePermissionKeysByNamespace(source) {
  const block = source.match(
    /export const PERMISSION_KEYS = \{([\s\S]*?)\n\} as const;/,
  );
  if (!block) throw new Error("permissions.ts: could not find PERMISSION_KEYS");
  const byNamespace = {};
  for (const m of block[1].matchAll(/:\s*"([\w]+):(\w+)"/g)) {
    const [, namespace, action] = m;
    if (!byNamespace[namespace]) byNamespace[namespace] = [];
    byNamespace[namespace].push(`${namespace}:${action}`);
  }
  return byNamespace;
}

// ---------------------------------------------------------------------------
// Derive post-login home per role. Mirrors the decision order of
// resolvePostLoginRedirect (scope.ts) -> resolveBranchHubDestination
// (branch-hub.ts) for the no-returnTo / no-standalone-station case, i.e. the
// actual "log in fresh, land where" outcome documented per role.
// ---------------------------------------------------------------------------

function derivePostLoginHomes(accessBuckets, adminRoles, centralSiteKinds) {
  const rows = [];
  for (const role of accessBuckets) {
    const isAdmin = adminRoles.includes(role);
    const centralKind = centralSiteKinds[role] ?? null;

    if (role === "owner") {
      rows.push({
        role,
        desktop: "/finance (Office plane)",
        phone: "/br (Operator plane branch picker, >1 branch) or /br/{branchId} directly",
        note: "Device-aware split (D050 §5): desktop/office context -> Office; phone -> Operator. Owner may also open any active branch POS/KDS/Runner to cover a shift.",
      });
      continue;
    }

    if (role === "office") {
      rows.push({
        role,
        desktop: "/employee",
        phone: "/employee",
        note: "D055 §3: /employee stays home for office by explicit decision, not leftover. Read access to /finance added (D058 §3).",
      });
      continue;
    }

    if (centralKind) {
      rows.push({
        role,
        desktop: `/br/{central-site-id} (home branch resolved server-side to the active ${centralKind} site)`,
        phone: `/br/{central-site-id} (same central site)`,
        note: `D055 soft-routing: JWT branch_id stays null; Branch Hub resolves homeBranchId by matching branches.branch_kind="${centralKind}". Falls back to /employee until resolved.`,
      });
      continue;
    }

    if (!isAdmin) {
      rows.push({
        role,
        desktop: "/br/{branchId} (Operator hub for the claimed branch)",
        phone: "/br/{branchId} (Operator hub for the claimed branch)",
        note: "D050 §5: non-admin, non-office, branch-pinned roles land in the Operator plane home for their JWT branch_id.",
      });
      continue;
    }

    rows.push({ role, desktop: "/employee", phone: "/employee", note: "" });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Doc rendering
// ---------------------------------------------------------------------------

function renderModuleAclTable(moduleAcl, roleLabels, navSources) {
  const header =
    "| Module key | Route path | Allowed roles | Nav/tile advertisement source |\n" +
    "| ---------- | ---------- | ------------- | ------------------------------ |";
  const rows = moduleAcl.map((entry) => {
    const roles =
      entry.allowedRoles.length > 0
        ? entry.allowedRoles.map((r) => roleLabels[r] ?? r).join(", ")
        : "(none — retired)";
    const sources = navSources[entry.key]
      ? [...navSources[entry.key]].sort().join("; ")
      : "(not advertised in nav — direct URL / redirect target only)";
    return `| \`${entry.key}\` | \`${entry.path}\` | ${roles} | ${sources} |`;
  });
  return [header, ...rows].join("\n");
}

function renderRouteFamilyTable(families) {
  const header =
    "| Family id | Surface | Entry path | Match prefixes | Module keys | Requires branchId |\n" +
    "| --------- | ------- | ---------- | --------------- | ----------- | ------------------ |";
  const rows = families.map((f) => {
    const prefixes = f.matchPrefixes.map((p) => `\`${p}\``).join(", ") || "—";
    const moduleKeys = f.moduleKeys.map((k) => `\`${k}\``).join(", ") || "—";
    return `| \`${f.id}\` | ${f.surface} | \`${f.entryPath}\` | ${prefixes} | ${moduleKeys} | ${f.requiresBranchId ? "yes" : "no"} |`;
  });
  return [header, ...rows].join("\n");
}

function renderPostLoginHomeTable(rows, roleLabels) {
  const header =
    "| Role | Desktop / office context | Phone / station context | Notes |\n" +
    "| ---- | ------------------------- | ------------------------ | ----- |";
  const body = rows.map(
    (r) =>
      `| ${roleLabels[r.role] ?? r.role} (\`${r.role}\`) | ${r.desktop} | ${r.phone} | ${r.note || "—"} |`,
  );
  return [header, ...body].join("\n");
}

function renderActionGateTable(moduleAcl, families, permissionsByNamespace) {
  const header =
    "| Route family | Route prefix(es) | Required route bucket | Action gate keys (from `permissions.ts`) |\n" +
    "| ------------ | ------------------ | ----------------------- | ------------------------------------------ |";
  const moduleAclByKey = Object.fromEntries(
    moduleAcl.map((entry) => [entry.key, entry]),
  );
  const rows = families
    .filter((f) => f.moduleKeys.length > 0 && f.matchPrefixes.length > 0)
    .map((f) => {
      const roleSet = new Set();
      for (const moduleKey of f.moduleKeys) {
        for (const role of moduleAclByKey[moduleKey]?.allowedRoles ?? []) {
          roleSet.add(role);
        }
      }
      // Namespace candidates: the moduleKey(s) and the family id verbatim
      // only — an exact match against a PERMISSION_KEYS namespace (e.g.
      // "pos", "kds", "hr", "finance", "inventory", "menu", "orders").
      // Deliberately NOT fuzzy-matched on name fragments (e.g. splitting
      // "branch_settings" into "branch"/"settings") — that produced false
      // positives (branch-dashboard picking up the unrelated tenant
      // `dashboard:view` key via the "dashboard" substring). A family with no
      // exact-name namespace genuinely has no dedicated action-permission
      // prefix and falls through to the module-level-only gate note, which is
      // the accurate statement.
      const namespaceCandidates = new Set([...f.moduleKeys, f.id]);
      const keys = new Set();
      for (const ns of namespaceCandidates) {
        for (const key of permissionsByNamespace[ns] ?? []) keys.add(key);
      }
      const prefixes = f.matchPrefixes.map((p) => `\`${p}\``).join(", ");
      const gateKeys =
        keys.size > 0
          ? [...keys].sort().map((k) => `\`${k}\``).join(", ")
          : "(module-level ACL gate only — no dedicated action-permission namespace)";
      return `| ${f.id} | ${prefixes} | ${[...roleSet].sort().join("/")} | ${gateKeys} |`;
    });
  return [header, ...rows].join("\n");
}

function buildGeneratedBody({
  moduleAcl,
  roleLabels,
  navSources,
  families,
  postLoginHomes,
  permissionsByNamespace,
}) {
  return [
    GENERATED_BEGIN,
    "",
    "<!--",
    "  This section is GENERATED by scripts/gen-role-route-matrix.mjs from:",
    `  ${MODULE_ACL_PATH}, ${ROUTE_MAP_PATH}, ${NAV_CONFIG_PATH},`,
    `  ${SCOPE_PATH}, ${BRANCH_HUB_PATH}, ${TYPES_PATH}, ${PERMISSIONS_PATH}.`,
    "  Do NOT hand-edit below this line — run `corepack pnpm gen:route-matrix`",
    "  after any auth-source change, and `corepack pnpm lint:route-matrix` (or",
    "  `--check`) verifies this block is not stale. Hand-authored prose",
    "  (product frame, principles, navigation contract, change checklist) lives",
    "  in the preamble above/below this block, which the generator preserves",
    "  verbatim.",
    "-->",
    "",
    "## Module ACL (generated)",
    "",
    "Single source: `packages/shared/src/auth/module-acl.ts`. \"Nav/tile",
    "advertisement source\" lists every nav array in `nav-config.ts` that",
    "surfaces the module to a role; a module with no source is reachable only",
    "by direct URL or as a redirect target.",
    "",
    renderModuleAclTable(moduleAcl, roleLabels, navSources),
    "",
    "## Route Family Contracts (generated)",
    "",
    "Single source: `ROUTE_FAMILY_CONTRACTS` in",
    "`packages/shared/src/auth/route-map.ts`. `resolveRouteFamilyContract`",
    "matches a pathname against `matchPrefixes` in declaration order (first",
    "match wins), which is why some families with narrower prefixes are",
    "declared before their broader siblings.",
    "",
    renderRouteFamilyTable(families),
    "",
    "## Post-Login Home By Role (generated)",
    "",
    "Derived from `resolvePostLoginRedirect` (`scope.ts`) falling through to",
    "`resolveBranchHubDestination` (`branch-hub.ts`) for the no-`returnTo`,",
    "no-standalone-station case — i.e. where a fresh login actually lands.",
    "Device-aware split and central-site soft-routing per D050/D055.",
    "",
    renderPostLoginHomeTable(postLoginHomes, roleLabels),
    "",
    "## Permission Boundary (generated)",
    "",
    "Route family -> required route bucket (module ACL union) -> the action-gate",
    "permission keys in that family's namespace(s), read from",
    "`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,",
    "not a hand-picked sample — route access and action authorization stay",
    "separate gates (route bucket here, permission key at the mutation site).",
    "",
    renderActionGateTable(moduleAcl, families, permissionsByNamespace),
    "",
    GENERATED_END,
  ].join("\n");
}

function collectGeneratedData() {
  const moduleAclSource = readSource(MODULE_ACL_PATH);
  const routeMapSource = readSource(ROUTE_MAP_PATH);
  const navConfigSource = readSource(NAV_CONFIG_PATH);
  const typesSource = readSource(TYPES_PATH);
  const permissionsSource = readSource(PERMISSIONS_PATH);
  // scope.ts / branch-hub.ts drive derivePostLoginHomes's decision order —
  // read so a missing/renamed file fails loudly instead of silently drifting.
  readSource(SCOPE_PATH);
  readSource(BRANCH_HUB_PATH);

  const accessBuckets = parseAccessBuckets(typesSource);
  const roleLabels = parseRoleLabels(typesSource);
  const centralSiteKinds = parseCentralSiteRoleBranchKinds(typesSource);
  const adminRolesMatch = typesSource.match(
    /export const ADMIN_ROLES: readonly StaffRole\[\] = \[([\s\S]*?)\] as const;/,
  );
  const adminRoles = adminRolesMatch
    ? [...adminRolesMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    : [];

  const moduleAcl = parseModuleAcl(moduleAclSource, accessBuckets, adminRoles);
  const moduleAclByKey = Object.fromEntries(
    moduleAcl.map((entry) => [entry.key, entry]),
  );
  const navSources = parseNavAdvertisementSources(navConfigSource);
  const families = parseRouteFamilyContracts(routeMapSource, moduleAclByKey);
  const permissionsByNamespace = parsePermissionKeysByNamespace(
    permissionsSource,
  );
  const postLoginHomes = derivePostLoginHomes(
    accessBuckets,
    adminRoles,
    centralSiteKinds,
  );

  return {
    moduleAcl,
    roleLabels,
    navSources,
    families,
    postLoginHomes,
    permissionsByNamespace,
  };
}

function regenerateDoc() {
  const docPath = path.join(REPO_ROOT, DOC_PATH);
  const current = fs.readFileSync(docPath, "utf8");

  const beginIndex = current.indexOf(GENERATED_BEGIN);
  const endIndex = current.indexOf(GENERATED_END);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(
      `${DOC_PATH}: missing or malformed GENERATED markers (${GENERATED_BEGIN} / ${GENERATED_END}). ` +
        "Add both markers around the section the generator owns before running this script.",
    );
  }

  const preambleBefore = current.slice(0, beginIndex).replace(/\s+$/, "");
  const preambleAfter = current
    .slice(endIndex + GENERATED_END.length)
    .trim();

  const generatedBody = buildGeneratedBody(collectGeneratedData());

  const rebuilt =
    `${preambleBefore}\n\n${generatedBody}` +
    (preambleAfter ? `\n\n${preambleAfter}\n` : "\n");

  return { rebuilt, current };
}

function main() {
  const { rebuilt, current } = regenerateDoc();

  if (CHECK_MODE) {
    if (rebuilt === current) {
      console.log(
        `[gen-role-route-matrix] ${DOC_PATH} is up to date with auth source.`,
      );
      process.exit(0);
    }
    console.error(
      `[gen-role-route-matrix] ${DOC_PATH} is STALE vs auth source (module-acl.ts / route-map.ts / nav-config.ts / scope.ts / branch-hub.ts / types.ts / permissions.ts).`,
    );
    console.error(
      `  Fix: run \`corepack pnpm gen:route-matrix\` and commit the result.`,
    );
    process.exit(1);
  }

  fs.writeFileSync(path.join(REPO_ROOT, DOC_PATH), rebuilt, "utf8");
  console.log(`[gen-role-route-matrix] wrote ${DOC_PATH}`);
}

main();

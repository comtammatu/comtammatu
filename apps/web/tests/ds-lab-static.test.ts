import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");

test("ds-lab production 404s and stays LANDING archetype", () => {
  const page = read("apps/web/app/(dev)/ds-lab/page.tsx");
  const archetypes = read("scripts/page-archetypes.mjs");

  assert.match(page, /process\.env\.NODE_ENV === "production"/);
  assert.match(page, /notFound\(\)/);
  assert.match(
    archetypes,
    /"apps\/web\/app\/\(dev\)\/ds-lab\/page\.tsx": "LANDING"/,
  );
});

test("ds-lab mirrors Layout UI/UX Frame plane recipes", () => {
  const client = read("apps/web/app/(dev)/ds-lab/ds-lab-client.tsx");
  const designSystem = read("docs/spec/design-system.md");

  assert.match(designSystem, /## Layout UI\/UX Frame/);
  assert.match(designSystem, /Shell chrome/);
  assert.match(designSystem, /Page rhythm/);
  assert.match(designSystem, /IA slots/);
  assert.match(designSystem, /Density by plane/);
  assert.match(designSystem, /Item-row LIST inset/);

  assert.match(client, /AppListFrame/);
  assert.match(client, /AppToolbar/);
  assert.match(client, /StationSection/);
  assert.match(client, /PublicSection/);
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /EmployeePanel/);
  assert.match(client, /density · comfortable/);
  assert.match(client, /density · compact/);
  assert.match(client, /Layout Frame · plane recipes/);
  assert.match(client, /Layout Frame · LIST chrome/);
});

test("ds-lab covers foundations, primitives, Item, states; Item section is not flush", () => {
  const client = read("apps/web/app/(dev)/ds-lab/ds-lab-client.tsx");

  // Foundations
  assert.match(client, /1 · Tokens/);
  assert.match(client, /Foreground roles/);
  assert.match(client, /2 · Typography/);
  assert.match(client, /3 · Spacing & radius/);

  // Primitives
  assert.match(client, /4 · Primitives · controls/);
  assert.match(client, /SelectTrigger/);
  assert.match(client, /Checkbox/);
  assert.match(client, /Switch/);
  assert.match(client, /RadioGroup/);
  assert.match(client, /Textarea/);
  assert.match(client, /5 · Primitives · chrome/);
  assert.match(client, /StatusBadge/);
  assert.match(client, /CompareChip/);
  assert.match(client, /AvatarFallback/);
  assert.match(client, /TabsTrigger/);
  assert.match(client, /Skeleton/);
  assert.match(client, /AlertTitle/);
  assert.match(client, /Focus ring/);

  // Item system — must NOT pass contentFlush prop (flush belongs to LIST chrome)
  assert.match(client, /7 · Item system/);
  assert.match(client, /Item xs has px-2 py-2/);
  assert.doesNotMatch(client, /\bcontentFlush=\{/);
  assert.match(client, /keeps contentFlush for the card chrome/);

  // LIST chrome — Item-row inset (not edge-flush rows)
  assert.match(client, /LIST_ITEM_INSET/);
  assert.match(client, /gap-2 px-3 py-3/);
  assert.match(client, /Item-row LIST uses px-3 py-3/);
  assert.match(client, /<ItemGroup className=\{LIST_ITEM_INSET\}>/);
  assert.match(client, /<DataTable/);
  assert.match(client, /AppEmptyState/);
  assert.match(client, /AppDetailFooter/);

  // UX + motion
  assert.match(client, /10 · UX · screen recipes/);
  assert.match(client, /UX_PERSONA_ROWS/);
  assert.match(client, /UX_FAMILY_RECIPES/);
  assert.match(client, /screen-context-map/);
  assert.match(client, /Decision Ladder/);
  assert.match(client, /11 · Motion · CSS animations/);
  assert.match(client, /MOTION_TOKENS/);
  assert.match(client, /--motion-fast/);
  assert.match(client, /prefers-reduced-motion/);
  assert.match(client, /motion-safe:animate-in/);
  assert.match(client, /Deferred \/ token gap/);
  assert.match(client, /Spinner/);

  assert.match(client, /12 · States/);
  assert.match(client, /ThemeToggle/);
});

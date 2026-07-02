import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GET as getKdsManifest } from "../app/(protected)/br/[branchId]/kds/manifest.webmanifest/route";
import { GET as getPosManifest } from "../app/(protected)/br/[branchId]/pos/manifest.webmanifest/route";

test("root PWA manifest requests portrait orientation", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  ) as {
    categories?: unknown;
    name?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    shortcuts?: Array<{ name?: unknown; url?: unknown }>;
    start_url?: unknown;
  };

  assert.equal(manifest.name, "Cơm Tấm Má Tư - Nhân viên");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.scope, "/employee");
  assert.equal(manifest.short_name, "Má Tư NV");
  assert.equal(manifest.start_url, "/employee");
  assert.deepEqual(manifest.categories, ["business", "productivity"]);
  assert.deepEqual(
    manifest.shortcuts?.map((shortcut) => shortcut.url),
    ["/employee", "/employee/clock", "/employee/tasks", "/employee/schedule"],
  );
});

test("POS PWA manifest requests portrait orientation per branch", async () => {
  const response = await getPosManifest(
    new Request("https://app.test/br/3/pos/manifest.webmanifest") as Parameters<
      typeof getPosManifest
    >[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
  };

  assert.equal(response.status, 200);
  assert.equal(manifest.id, "/br/3/pos");
  assert.equal(manifest.start_url, "/br/3/pos");
  assert.equal(manifest.scope, "/br/3/pos");
  assert.equal(manifest.short_name, "Má Tư POS");
  assert.equal(manifest.orientation, "portrait");
});

test("KDS PWA manifest requests landscape orientation per branch", async () => {
  const response = await getKdsManifest(
    new Request("https://app.test/br/3/kds/manifest.webmanifest") as Parameters<
      typeof getKdsManifest
    >[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
  };

  assert.equal(response.status, 200);
  assert.equal(manifest.id, "/br/3/kds");
  assert.equal(manifest.start_url, "/br/3/kds");
  assert.equal(manifest.scope, "/br/3/kds");
  assert.equal(manifest.short_name, "Má Tư KDS");
  assert.equal(manifest.orientation, "landscape");
});

test("POS PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getPosManifest(
    new Request(
      "https://app.test/br/abc/pos/manifest.webmanifest",
    ) as Parameters<typeof getPosManifest>[0],
    { params: Promise.resolve({ branchId: "abc" }) },
  );

  assert.equal(response.status, 400);
});

test("KDS PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getKdsManifest(
    new Request(
      "https://app.test/br/abc/kds/manifest.webmanifest",
    ) as Parameters<typeof getKdsManifest>[0],
    { params: Promise.resolve({ branchId: "abc" }) },
  );

  assert.equal(response.status, 400);
});

test("operational PWA install dismissal is isolated by app and branch", () => {
  const toolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(toolbarSource, /function getDismissStorageKey/);
  assert.match(
    toolbarSource,
    /operational-pwa-install-dismissed:\$\{surface\}:\$\{branchId\}/,
  );
  assert.doesNotMatch(toolbarSource, /LEGACY_POS_DISMISS_STORAGE_KEY/);
  assert.doesNotMatch(toolbarSource, /pos-pwa-install-dismissed/);
});

test("POS and KDS toolbars render a return-to-hub link; runner never does", () => {
  const toolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const pwaToolbarSource = readFileSync(
    new URL("../app/components/pwa-toolbar.tsx", import.meta.url),
    "utf8",
  );

  // Runner is a guest-facing display: staff navigation is excluded there.
  assert.match(toolbarSource, /surface !== "runner"/);
  assert.match(toolbarSource, /<PwaToolbarHubLink/);
  assert.match(toolbarSource, /surface="pos"/);
  assert.match(toolbarSource, /surface="kds"/);
  assert.match(toolbarSource, /surface="runner"/);

  // The link targets the operator hub home for the current branch, carries an
  // accessible label from the copy catalog, and uses the 48px touch size.
  assert.match(
    toolbarSource,
    /<PwaToolbarHubLink\s+href=\{`\/br\/\$\{branchId\}`\}\s+label=\{copy\.hubLinkLabel\}/,
  );
  assert.match(toolbarSource, /hubLinkLabel: "Về màn hình chính chi nhánh"/);
  assert.match(
    pwaToolbarSource,
    /<Link href=\{href\} aria-label=\{label\}>/,
  );
  assert.match(
    pwaToolbarSource,
    /asChild\s+variant="ghost"\s+size="icon-touch"/,
  );

  // POS/KDS keep the hub link even in the quiet state (standalone or install
  // hint dismissed) where the toolbar previously rendered nothing; only the
  // runner surface still returns null there.
  assert.match(pwaToolbarSource, /if \(hubLink == null\) return null;/);
});

test("station layouts mount the branch-scoped PWA toolbars", () => {
  const layoutSource = (station: string) =>
    readFileSync(
      new URL(
        `../app/(protected)/br/[branchId]/${station}/layout.tsx`,
        import.meta.url,
      ),
      "utf8",
    );

  assert.match(layoutSource("pos"), /<PosPwaToolbar branchId=\{branchId\} \/>/);
  assert.match(layoutSource("kds"), /<KdsPwaToolbar branchId=\{branchId\} \/>/);
  assert.match(
    layoutSource("runner"),
    /<RunnerPwaToolbar branchId=\{branchId\} \/>/,
  );
});

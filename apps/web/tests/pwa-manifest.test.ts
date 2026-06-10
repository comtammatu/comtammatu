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
  ) as { orientation?: unknown; short_name?: unknown };

  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.short_name, "Má Tư");
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
  assert.match(toolbarSource, /LEGACY_POS_DISMISS_STORAGE_KEY/);
  assert.doesNotMatch(
    toolbarSource,
    /const DISMISS_STORAGE_KEY = "pos-pwa-install-dismissed"/,
  );
});

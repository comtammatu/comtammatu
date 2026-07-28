import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC chrome — Wave A (D3 Author DocumentFormFrame).
 *
 * Ratchets Author DOC create routes onto DocumentFormFrame + AppDetailFooter
 * instead of bare AppSection stacks / hand-rolled AppPage shells.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const AUTHOR_DOC = [
  {
    name: "production/new",
    page: "app/(protected)/inventory/production/new/page.tsx",
    client:
      "app/(protected)/inventory/production/new/production-new-client.tsx",
  },
  {
    name: "grn/new/[supplierId]",
    page: "app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
    client:
      "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  },
  {
    name: "waste/new",
    page: "app/(protected)/inventory/waste/new/page.tsx",
    client: "app/(protected)/inventory/waste/new/waste-create-client.tsx",
  },
  {
    name: "stocktake/new",
    page: "app/(protected)/inventory/stocktake/new/page.tsx",
    client:
      "app/(protected)/inventory/stocktake/new/new-session-client.tsx",
  },
] as const;

test("Wave A Author DOC clients use DocumentFormFrame", () => {
  for (const surface of AUTHOR_DOC) {
    const client = read(surface.client);
    const footerSource =
      surface.name === "waste/new"
        ? `${client}\n${read("app/(protected)/inventory/waste/waste-operational-form.tsx")}`
        : client;
    assert.match(
      client,
      /DocumentFormFrame/,
      `${surface.name}: DocumentFormFrame`,
    );
    assert.match(
      client,
      /<DocumentFormFrame[\s>]/,
      `${surface.name}: <DocumentFormFrame`,
    );
    assert.match(
      footerSource,
      /AppDetailFooter/,
      `${surface.name}: AppDetailFooter`,
    );
  }
});

test("Wave A production/new page delegates chrome to DocumentFormFrame client", () => {
  const page = read("app/(protected)/inventory/production/new/page.tsx");
  const client = read(
    "app/(protected)/inventory/production/new/production-new-client.tsx",
  );

  assert.doesNotMatch(
    page,
    /<AppPage[\s>]/,
    "production/new page: no outer AppPage (client owns DocumentFormFrame)",
  );
  assert.doesNotMatch(
    page,
    /<AppPageHeader[\s>]/,
    "production/new page: no AppPageHeader (client owns header slot)",
  );
  assert.match(
    client,
    /<DocumentFormFrame[\s\S]*footer=\{footer\}/,
    "production/new client: DocumentFormFrame footer slot",
  );
  assert.match(
    client,
    /embedded[\s\S]*AppDetailFooter|AppDetailFooter[\s\S]*sticky=\{embedded\}/,
    "production/new client: Branch embedded keeps sticky footer without DocumentFormFrame",
  );
});

test("Wave A GRN create opens DocumentFormFrame without supplier picker", () => {
  const page = read("app/(protected)/inventory/grn/new/page.tsx");
  const client = read(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );

  assert.match(page, /loadGrnCreatePageData/);
  assert.match(page, /GrnCreateClient/);
  assert.doesNotMatch(page, /SupplierPicker/);
  assert.match(client, /DocumentFormFrame/);
  assert.match(client, /width="wide"/);
  assert.match(client, /density="compact"/);
  assert.match(client, /GRN_CREATE_COPY\.newReceiptTitle/);
});

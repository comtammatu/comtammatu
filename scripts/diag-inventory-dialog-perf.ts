/**
 * Diagnostic: Inventory AppDialog open-path cost (YCM / PO / GRN).
 * Not part of the default verify suite — run manually while fixing.
 *
 *   corepack pnpm --filter web exec tsx ../../scripts/diag-inventory-dialog-perf.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

type Finding = {
  id: string;
  severity: "P0" | "P1" | "P2";
  surface: string;
  prediction: string;
  evidence: string;
  present: boolean;
};

const poPage = read("apps/web/app/(protected)/inventory/purchase-orders/page.tsx");
const demandClient = read(
  "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
);
const ordersClient = read(
  "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
);
const grnPage = read("apps/web/app/(protected)/inventory/grn/page.tsx");
const dialogUi = read("packages/ui/src/components/dialog.tsx");
const appDialog = read("apps/web/app/components/form/form-dialog.tsx");
const overlayHookPath = resolve(
  root,
  "apps/web/lib/navigation/use-document-overlay-url.ts",
);

const findings: Finding[] = [
  {
    id: "H1",
    severity: "P0",
    surface: "YCM/PO workspace",
    prediction:
      "Dialog-only demandId/poId must not sit on the list RSC searchParams contract; clients must use History-API overlay URL.",
    evidence:
      "purchase-orders/page.tsx must omit demandId/poId from searchParams type; clients use useDocumentOverlayUrl.",
    present:
      /demandId\?:/.test(poPage) ||
      /poId\?:/.test(poPage) ||
      !/useDocumentOverlayUrl/.test(demandClient) ||
      !/useDocumentOverlayUrl/.test(ordersClient),
  },
  {
    id: "H2",
    severity: "P0",
    surface: "GRN list → dialog",
    prediction:
      "List page must not RSC-mount GRNDetailClient; detail loads via client host.",
    evidence:
      'grn/page.tsx must not use presentation="dialog" / loadGrnDetailResult / GRNDetailClient.',
    present:
      /presentation="dialog"/.test(grnPage) ||
      /loadGrnDetailResult/.test(grnPage) ||
      /GRNDetailClient/.test(grnPage) ||
      !/GrnDocumentDialogHost/.test(grnPage),
  },
  {
    id: "H3",
    severity: "P1",
    surface: "YCM create AppDialog",
    prediction:
      "Create dialog must not map ingredients inline per line; hoist options and gate body.",
    evidence:
      "purchase-requests-client uses ingredientOptions and createOpen ? body.",
    present:
      /options=\{ingredients\.map/.test(demandClient) ||
      !/ingredientOptions/.test(demandClient) ||
      !/createOpen \? \(/.test(demandClient),
  },
  {
    id: "H4",
    severity: "P1",
    surface: "AppDialog shell",
    prediction: "AppDialog must gate children when !open.",
    evidence: "gatedChildren = open ? children : null before split.",
    present: !/gatedChildren\s*=\s*open\s*\?\s*children\s*:\s*null/.test(
      appDialog,
    ),
  },
  {
    id: "H5",
    severity: "P2",
    surface: "Dialog overlay paint",
    prediction: "Dialog overlay must not use backdrop-blur; popup must not zoom.",
    evidence: "packages/ui dialog without backdrop-blur / zoom-in-95.",
    present:
      /backdrop-blur/.test(dialogUi) || /zoom-in-95/.test(dialogUi),
  },
  {
    id: "H0",
    severity: "P0",
    surface: "Overlay primitive",
    prediction: "History-API overlay hook must exist.",
    evidence: "apps/web/lib/navigation/use-document-overlay-url.ts",
    present: !existsSync(overlayHookPath),
  },
];

const active = findings.filter((f) => f.present);
for (const f of findings) {
  const mark = f.present ? "RED" : "green";
  console.log(`[${mark}] ${f.id} ${f.severity} · ${f.surface}`);
  console.log(`  ${f.prediction}`);
  console.log(`  evidence: ${f.evidence}`);
  console.log("");
}

console.log(
  `Summary: ${active.length}/${findings.length} active cost drivers (0 expected after fix).`,
);
process.exit(active.length > 0 ? 1 : 0);

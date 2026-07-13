import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppSection, OperationalTile } from "../app/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Combobox } from "@comtammatu/ui/components/combobox";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@comtammatu/ui/components/command";
import { EmptyDescription, EmptyMedia } from "@comtammatu/ui/components/empty";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Toolbar } from "@comtammatu/ui/components/toolbar";
import {
  getPaginationItems,
  PAGINATION_ELLIPSIS,
} from "@comtammatu/ui/lib/pagination";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Má Tư DS primitive parity files are present in the shared UI package", () => {
  for (const path of [
    "packages/ui/src/components/accordion.tsx",
    "packages/ui/src/components/combobox.tsx",
    "packages/ui/src/components/date-picker.tsx",
    "packages/ui/src/components/pagination.tsx",
    "packages/ui/src/components/resizable.tsx",
    "packages/ui/src/components/slider.tsx",
    "packages/ui/src/components/tag-input.tsx",
    "packages/ui/src/components/toolbar.tsx",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const designSystem = read("docs/spec/design-system.md");
  assert.match(designSystem, /BrandSymbol/);
  assert.match(designSystem, /Combobox/);
  assert.match(designSystem, /Pagination/);
});

test("Má Tư DS brand asset set includes mascot metadata and symbols", () => {
  for (const path of [
    "apps/web/public/brand/mascot/cotlet.pet.json",
    "apps/web/public/brand/mascot/cotlet.contact-sheet.png",
    "apps/web/public/brand/symbols/dia-tron.svg",
    "apps/web/public/brand/symbols/dua.svg",
    "apps/web/public/brand/symbols/hat-gao.svg",
    "apps/web/public/brand/symbols/mai-nha.svg",
    "apps/web/public/brand/symbols/to-com.svg",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const brandSource = read("apps/web/app/components/brand.tsx");
  assert.match(brandSource, /export function BrandSymbol/);
  assert.match(brandSource, /export function BrandMascot/);
});

test("shared Drawer stays bottom-anchored across mobile viewport changes", () => {
  const drawerSource = read("packages/ui/src/components/drawer.tsx");
  const posSource = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const archivedOrdersSource = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
  );
  const checkoutApprovalsSource = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );

  assert.match(drawerSource, /direction = "bottom"/);
  assert.match(drawerSource, /fixed = true/);
  assert.match(drawerSource, /data-\[vaul-drawer-direction=bottom\]:!bottom-0/);
  assert.match(
    drawerSource,
    /data-\[vaul-drawer-direction=bottom\]:before:bottom-0/,
  );
  assert.match(drawerSource, /overscroll-contain/);
  assert.match(drawerSource, /motion-reduce:animate-none/);
  assert.doesNotMatch(posSource, /data-\[vaul-drawer-direction=bottom\]:top-0/);
  assert.doesNotMatch(
    archivedOrdersSource,
    /data-\[vaul-drawer-direction=bottom\]:top-0/,
  );
  assert.doesNotMatch(checkoutApprovalsSource, /<Drawer/);
  assert.equal((checkoutApprovalsSource.match(/<Sheet\s/g) ?? []).length, 1);
  assert.match(checkoutApprovalsSource, /setRejecting\(true\)/);
});

test("pagination items keep stable ellipsis windows", () => {
  assert.deepEqual(getPaginationItems(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(getPaginationItems(5, 10), [
    1,
    PAGINATION_ELLIPSIS,
    4,
    5,
    6,
    PAGINATION_ELLIPSIS,
    10,
  ]);
  assert.deepEqual(getPaginationItems(99, 10), [1, PAGINATION_ELLIPSIS, 9, 10]);
});

test("shared component contracts render stable semantics and states", () => {
  const cases = [
    {
      name: "empty description",
      node: createElement(EmptyDescription, null, "Không có dữ liệu"),
      matches: [/^<p/, /data-slot="empty-description"/, /Không có dữ liệu/],
    },
    {
      name: "empty media",
      node: createElement(EmptyMedia, { variant: "icon" }, "+"),
      matches: [/data-slot="empty-media"/, /data-variant="icon"/],
    },
    {
      name: "touch icon button",
      node: createElement(
        Button,
        { size: "icon-touch", "aria-label": "Mở menu" },
        "+",
      ),
      matches: [
        /<button[^>]*data-slot="button"/,
        /data-size="icon-touch"/,
        /aria-label="Mở menu"/,
        /size-12/,
      ],
    },
    {
      name: "checked checkbox",
      node: createElement(Checkbox, {
        checked: true,
        "aria-label": "Chọn dòng",
      }),
      matches: [
        /role="checkbox"/,
        /aria-checked="true"/,
        /aria-label="Chọn dòng"/,
        /data-state="checked"/,
        /data-slot="checkbox"/,
      ],
    },
    {
      name: "checked switch",
      node: createElement(Switch, {
        checked: true,
        "aria-label": "Bật nhận đơn",
      }),
      matches: [
        /role="switch"/,
        /aria-checked="true"/,
        /aria-label="Bật nhận đơn"/,
        /data-state="checked"/,
        /data-slot="switch"/,
      ],
    },
    {
      name: "selected radio",
      node: createElement(
        RadioGroup,
        { defaultValue: "morning", "aria-label": "Chọn ca" },
        createElement(RadioGroupItem, {
          value: "morning",
          "aria-label": "Ca sáng",
        }),
      ),
      matches: [
        /role="radiogroup"/,
        /aria-label="Chọn ca"/,
        /role="radio"/,
        /aria-label="Ca sáng"/,
        /aria-checked="true"/,
        /data-state="checked"/,
      ],
    },
    {
      name: "selected tab",
      node: createElement(
        Tabs,
        { defaultValue: "queue" },
        createElement(
          TabsList,
          { "aria-label": "Trạng thái đơn" },
          createElement(TabsTrigger, { value: "queue" }, "Chờ xử lý"),
        ),
        createElement(TabsContent, { value: "queue" }, "Danh sách"),
      ),
      matches: [
        /role="tablist"/,
        /aria-label="Trạng thái đơn"/,
        /role="tab"/,
        /aria-selected="true"/,
        /aria-controls=/,
        /data-state="active"/,
      ],
    },
    {
      name: "closed combobox",
      node: createElement(Combobox, {
        options: [{ value: "one", label: "Một" }],
        "aria-label": "Chọn mục",
        size: "touch",
      }),
      matches: [
        /role="combobox"/,
        /aria-expanded="false"/,
        /aria-label="Chọn mục"/,
        /data-slot="combobox-trigger"/,
        /data-combobox-slot="trigger"/,
        /data-size="touch"/,
        /data-state="closed"/,
      ],
    },
    {
      name: "layout-only toolbar",
      node: createElement(
        Toolbar,
        { "aria-label": "Bộ lọc danh sách" },
        createElement(Button, null, "Lọc"),
      ),
      matches: [/data-slot="toolbar"/, /aria-label="Bộ lọc danh sách"/],
      doesNotMatch: [/role="toolbar"/],
    },
    {
      name: "combobox option hook",
      node: createElement(
        Command,
        null,
        createElement(
          CommandList,
          null,
          createElement(
            CommandGroup,
            null,
            createElement(
              CommandItem,
              {
                value: "Một",
                "data-combobox-slot": "option",
                "data-option-value": "one",
              },
              "Một",
            ),
          ),
        ),
      ),
      matches: [
        /data-slot="command-item"/,
        /data-combobox-slot="option"/,
        /data-option-value="one"/,
      ],
    },
  ] as const;

  for (const contract of cases) {
    const markup = renderToStaticMarkup(contract.node);
    for (const pattern of contract.matches) {
      assert.match(markup, pattern, `${contract.name} should match ${pattern}`);
    }
    if ("doesNotMatch" in contract) {
      for (const pattern of contract.doesNotMatch) {
        assert.doesNotMatch(
          markup,
          pattern,
          `${contract.name} should not match ${pattern}`,
        );
      }
    }
  }
});

test("app adapters preserve Radix disclosure state and selection semantics", () => {
  const section = renderToStaticMarkup(
    createElement(
      AppSection,
      { title: "Bộ lọc", collapsible: true, defaultOpen: false },
      createElement("p", null, "Nội dung"),
    ),
  );
  assert.match(section, /<div[^>]*data-slot="card"[^>]*data-ui="app-section"/);
  assert.match(section, /data-ui="app-section"/);
  assert.match(section, /data-state="closed"/);
  assert.match(section, /data-ui="app-section-toggle"/);
  assert.match(section, /aria-expanded="false"/);
  assert.match(section, /aria-controls=/);
  assert.match(section, />Bộ lọc: Xem thêm<\/span>/);
  assert.match(section, />Bộ lọc: Thu gọn<\/span>/);
  assert.match(section, /sr-only group-data-\[state=open\]\/button:hidden/);
  assert.match(section, /sr-only group-data-\[state=closed\]\/button:hidden/);

  const tile = renderToStaticMarkup(
    createElement(OperationalTile, { selected: true }, "Bàn 01"),
  );
  assert.match(tile, /data-ui="operational-tile"/);
  assert.match(tile, /data-state="selected"/);
  assert.match(tile, /aria-pressed="true"/);

  const unselectedTile = renderToStaticMarkup(
    createElement(OperationalTile, { selected: false }, "Bàn 02"),
  );
  assert.match(unselectedTile, /data-state="unselected"/);
  assert.match(unselectedTile, /aria-pressed="false"/);

  const actionTile = renderToStaticMarkup(
    createElement(OperationalTile, null, "Tạo đơn"),
  );
  assert.match(actionTile, /data-state="idle"/);
  assert.doesNotMatch(actionTile, /aria-pressed=/);
});

test("combobox portal hooks preserve nested component slot ownership", () => {
  const comboboxSource = read("packages/ui/src/components/combobox.tsx");

  assert.match(comboboxSource, /data-combobox-slot="content"/);
  assert.match(comboboxSource, /data-combobox-slot="option"/);
  assert.match(comboboxSource, /data-option-value=\{option\.value\}/);
  assert.doesNotMatch(comboboxSource, /data-slot="combobox-content"/);
  assert.doesNotMatch(comboboxSource, /data-slot="combobox-option"/);
  assert.doesNotMatch(comboboxSource, /data-value=\{option\.value\}/);
});

test("resting surfaces stay border-first", () => {
  const accordionSource = read("packages/ui/src/components/accordion.tsx");
  const cardSource = read("packages/ui/src/components/card.tsx");
  const tokens = read("packages/ui/src/styles/globals.css");
  const designSystem = read("docs/spec/design-system.md");

  assert.doesNotMatch(accordionSource, /shadow-effect-card-resting/);
  assert.doesNotMatch(cardSource, /shadow-effect-card-resting/);
  assert.doesNotMatch(tokens, /effect-card-resting/);
  assert.doesNotMatch(designSystem, /shadow-effect-card-resting/);
  assert.match(designSystem, /resting surfaces are separated by `--border`/);
});

test("the shared component layer has one canonical metric card", () => {
  assert.equal(exists("packages/ui/src/components/stat.tsx"), false);
  assert.doesNotMatch(
    read(
      "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
    ),
    /@comtammatu\/ui\/components\/stat/,
  );
  assert.match(
    read("apps/web/app/components/kpi/kpi-card.tsx"),
    /export interface KpiCardProps/,
  );
});

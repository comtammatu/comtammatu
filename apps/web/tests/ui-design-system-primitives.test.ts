import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { BreadcrumbLink } from "@comtammatu/ui/components/breadcrumb";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Separator } from "@comtammatu/ui/components/separator";
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

test("app metrics use KpiCard without the retired Stat primitive", () => {
  const supplierInvoices = read(
    "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.equal(exists("packages/ui/src/components/stat.tsx"), false);
  assert.doesNotMatch(read("docs/modules/ui.md"), /`stat`/);
  assert.match(supplierInvoices, /import \{ KpiCard \}/);
  assert.equal(supplierInvoices.match(/<KpiCard/g)?.length, 4);
  assert.doesNotMatch(supplierInvoices, /components\/stat["']|<Stat(?:\s|>)/);
});

test("shared primitives use Base UI behavior without Radix", () => {
  const badgeSource = read("packages/ui/src/components/badge.tsx");
  const buttonSource = read("packages/ui/src/components/button.tsx");
  const itemSource = read("packages/ui/src/components/item.tsx");
  const accordionSource = read("packages/ui/src/components/accordion.tsx");
  const alertDialogSource = read("packages/ui/src/components/alert-dialog.tsx");
  const avatarSource = read("packages/ui/src/components/avatar.tsx");
  const breadcrumbSource = read("packages/ui/src/components/breadcrumb.tsx");
  const checkboxSource = read("packages/ui/src/components/checkbox.tsx");
  const collapsibleSource = read("packages/ui/src/components/collapsible.tsx");
  const comboboxSource = read("packages/ui/src/components/combobox.tsx");
  const dialogSource = read("packages/ui/src/components/dialog.tsx");
  const dropdownMenuSource = read(
    "packages/ui/src/components/dropdown-menu.tsx",
  );
  const progressSource = read("packages/ui/src/components/progress.tsx");
  const popoverSource = read("packages/ui/src/components/popover.tsx");
  const radioGroupSource = read("packages/ui/src/components/radio-group.tsx");
  const selectSource = read("packages/ui/src/components/select.tsx");
  const sidebarSource = read("packages/ui/src/components/sidebar.tsx");
  const switchSource = read("packages/ui/src/components/switch.tsx");
  const sheetSource = read("packages/ui/src/components/sheet.tsx");
  const tabsSource = read("packages/ui/src/components/tabs.tsx");
  const tagInputSource = read("packages/ui/src/components/tag-input.tsx");
  const toggleSource = read("packages/ui/src/components/toggle.tsx");
  const toggleGroupSource = read("packages/ui/src/components/toggle-group.tsx");
  const tooltipSource = read("packages/ui/src/components/tooltip.tsx");
  const globals = read("packages/ui/src/styles/globals.css");
  const uiPackage = read("packages/ui/package.json");

  assert.match(badgeSource, /@base-ui\/react\/use-render/);
  assert.match(badgeSource, /useRender\.ComponentProps<"span">/);
  assert.match(badgeSource, /defaultTagName: "span"/);
  assert.match(badgeSource, /mergeProps<"span">/);
  assert.doesNotMatch(badgeSource, /radix-ui|Slot|asChild/);
  assert.match(buttonSource, /@base-ui\/react\/use-render/);
  assert.match(buttonSource, /useRender\.ComponentProps<"button">/);
  assert.match(buttonSource, /defaultTagName: "button"/);
  assert.doesNotMatch(buttonSource, /radix-ui|Slot|asChild/);
  assert.match(itemSource, /@base-ui\/react\/use-render/);
  assert.match(itemSource, /useRender\.ComponentProps<"div">/);
  assert.match(itemSource, /defaultTagName: "div"/);
  assert.doesNotMatch(itemSource, /radix-ui|Slot|asChild/);
  assert.match(accordionSource, /@base-ui\/react\/accordion/);
  assert.match(accordionSource, /AccordionPrimitive\.Panel/);
  assert.doesNotMatch(accordionSource, /radix-ui/);
  assert.match(alertDialogSource, /@base-ui\/react\/alert-dialog/);
  assert.match(alertDialogSource, /AlertDialogPrimitive\.Backdrop/);
  assert.match(alertDialogSource, /AlertDialogPrimitive\.Popup/);
  assert.doesNotMatch(
    alertDialogSource,
    /radix-ui|AlertDialogPrimitive\.(?:Action|Cancel|Content|Overlay)/,
  );
  assert.match(avatarSource, /@base-ui\/react\/avatar/);
  assert.doesNotMatch(avatarSource, /radix-ui/);
  assert.match(breadcrumbSource, /@base-ui\/react\/use-render/);
  assert.match(breadcrumbSource, /defaultTagName: "a"/);
  assert.doesNotMatch(breadcrumbSource, /radix-ui|Slot|asChild/);
  assert.match(checkboxSource, /@base-ui\/react\/checkbox/);
  assert.doesNotMatch(checkboxSource, /radix-ui/);
  assert.match(collapsibleSource, /@base-ui\/react\/collapsible/);
  assert.match(collapsibleSource, /CollapsiblePrimitive\.Panel/);
  assert.doesNotMatch(collapsibleSource, /radix-ui/);
  assert.match(comboboxSource, /@base-ui\/react\/combobox/);
  assert.match(comboboxSource, /BaseCombobox\.List/);
  assert.doesNotMatch(comboboxSource, /cmdk|radix-ui|\.\/command/);
  assert.match(tagInputSource, /@base-ui\/react\/combobox/);
  assert.match(tagInputSource, /BaseCombobox\.Chips/);
  assert.equal(
    exists("packages/ui/src/components/command.tsx"),
    false,
    "the custom command adapter should be deleted in favor of Base UI Combobox",
  );
  assert.match(dialogSource, /@base-ui\/react\/dialog/);
  assert.match(dialogSource, /DialogPrimitive\.(?:Backdrop|Popup)/);
  assert.doesNotMatch(
    dialogSource,
    /radix-ui|DialogPrimitive\.(?:Content|Overlay)|asChild/,
  );
  assert.match(dropdownMenuSource, /@base-ui\/react\/menu/);
  assert.match(dropdownMenuSource, /DropdownMenuPrimitive\.Positioner/);
  assert.match(dropdownMenuSource, /DropdownMenuPrimitive\.SubmenuRoot/);
  assert.doesNotMatch(
    dropdownMenuSource,
    /radix-ui|--radix-dropdown-menu|DropdownMenuPrimitive\.(?:Content|ItemIndicator|Label|SubContent|SubTrigger)|asChild/,
  );
  assert.match(progressSource, /@base-ui\/react\/progress/);
  assert.match(progressSource, /value=\{value \?\? null\}/);
  assert.doesNotMatch(progressSource, /radix-ui/);
  assert.match(popoverSource, /@base-ui\/react\/popover/);
  assert.match(popoverSource, /PopoverPrimitive\.Positioner/);
  assert.match(popoverSource, /--transform-origin/);
  assert.doesNotMatch(
    popoverSource,
    /radix-ui|--radix-popover|PopoverAnchor|asChild/,
  );
  assert.match(radioGroupSource, /@base-ui\/react\/radio-group/);
  assert.match(radioGroupSource, /@base-ui\/react\/radio/);
  assert.doesNotMatch(radioGroupSource, /radix-ui/);
  assert.match(selectSource, /@base-ui\/react\/select/);
  assert.match(selectSource, /SelectPrimitive\.(?:Positioner|Popup|List)/);
  assert.doesNotMatch(selectSource, /radix-ui|--radix-|asChild/);
  assert.match(sidebarSource, /@base-ui\/react\/use-render/);
  assert.match(sidebarSource, /useRender\.ComponentProps<"button">/);
  assert.doesNotMatch(sidebarSource, /radix-ui|Slot|asChild/);
  assert.match(switchSource, /@base-ui\/react\/switch/);
  assert.doesNotMatch(switchSource, /radix-ui/);
  assert.match(sheetSource, /@base-ui\/react\/dialog/);
  assert.match(sheetSource, /SheetPrimitive\.(?:Backdrop|Popup)/);
  assert.doesNotMatch(
    sheetSource,
    /radix-ui|SheetPrimitive\.(?:Content|Overlay)|asChild/,
  );
  assert.match(tabsSource, /@base-ui\/react\/tabs/);
  assert.match(tabsSource, /TabsPrimitive\.Panel/);
  assert.doesNotMatch(tabsSource, /radix-ui/);
  assert.match(toggleSource, /@base-ui\/react\/toggle/);
  assert.match(toggleSource, /data-pressed:bg-muted/);
  assert.doesNotMatch(toggleSource, /radix-ui|data-\[state=on]/);
  assert.match(toggleGroupSource, /@base-ui\/react\/toggle-group/);
  assert.match(toggleGroupSource, /@base-ui\/react\/toggle/);
  assert.match(toggleGroupSource, /multiple=\{multiple\}/);
  assert.doesNotMatch(toggleGroupSource, /radix-ui/);
  assert.match(tooltipSource, /@base-ui\/react\/tooltip/);
  assert.match(tooltipSource, /TooltipPrimitive\.Positioner/);
  assert.match(tooltipSource, /--transform-origin/);
  assert.doesNotMatch(tooltipSource, /radix-ui|--radix-tooltip|asChild/);
  assert.match(globals, /--accordion-panel-height/);
  assert.doesNotMatch(globals, /--radix-accordion-content-height/);
  assert.match(uiPackage, /"@base-ui\/react": "1\.6\.0"/);
});

test("Base render composition preserves semantic link elements", () => {
  const button = renderToStaticMarkup(
    createElement(
      Button,
      { render: createElement("a", { href: "/orders" }) },
      "Orders",
    ),
  );
  const badge = renderToStaticMarkup(
    createElement(
      Badge,
      { render: createElement("a", { href: "/orders" }) },
      "Orders",
    ),
  );
  const item = renderToStaticMarkup(
    createElement(
      Item,
      { render: createElement("a", { href: "/stock" }) },
      "Stock",
    ),
  );
  const breadcrumb = renderToStaticMarkup(
    createElement(
      BreadcrumbLink,
      { render: createElement("a", { href: "/reports" }) },
      "Reports",
    ),
  );

  assert.match(button, /^<a href="\/orders"[^>]*data-slot="button"/);
  assert.match(badge, /^<a href="\/orders"[^>]*data-slot="badge"/);
  assert.match(item, /^<a href="\/stock"[^>]*data-slot="item"/);
  assert.match(
    breadcrumb,
    /^<a href="\/reports"[^>]*data-slot="breadcrumb-link"/,
  );
});

test("Base floating layers stack above app chrome and Select resolves labels", () => {
  const selectSource = read("packages/ui/src/components/select.tsx");
  const floatingSources = [
    read("packages/ui/src/components/combobox.tsx"),
    read("packages/ui/src/components/context-menu.tsx"),
    read("packages/ui/src/components/dropdown-menu.tsx"),
    read("packages/ui/src/components/popover.tsx"),
    read("packages/ui/src/components/select.tsx"),
    read("packages/ui/src/components/tag-input.tsx"),
    read("packages/ui/src/components/tooltip.tsx"),
  ];

  for (const source of floatingSources) {
    assert.match(
      source,
      /Positioner[\s\S]*?className="isolate z-50(?: outline-none)?"/,
    );
  }

  const select = renderToStaticMarkup(
    createElement(
      Select,
      { value: "all" },
      createElement(
        SelectTrigger,
        { "aria-label": "Order type" },
        createElement(SelectValue, { placeholder: "Filter" }),
      ),
      createElement(
        SelectContent,
        null,
        createElement(
          SelectGroup,
          null,
          createElement(SelectItem, { value: "all" }, "Tất cả"),
        ),
      ),
    ),
  );

  assert.match(select, />Tất cả</);
  assert.doesNotMatch(select, />all</);
  assert.match(selectSource, /px-2 py-1 pr-8/);

  const explicitItemsSelect = renderToStaticMarkup(
    createElement(
      Select,
      { items: { all: "Mọi trạng thái" }, value: "all" },
      createElement(
        SelectTrigger,
        { "aria-label": "Status" },
        createElement(SelectValue),
      ),
      createElement(
        SelectContent,
        null,
        createElement(SelectItem, { value: "all" }, "Tất cả"),
      ),
    ),
  );

  assert.match(explicitItemsSelect, />Mọi trạng thái</);
  assert.doesNotMatch(explicitItemsSelect, />Tất cả</);
});

test("app combobox adapters preserve Vietnamese search without exposing Base UI parts", () => {
  const sharedCombobox = read("packages/ui/src/components/combobox.tsx");
  const formCombobox = read("apps/web/app/components/form/combobox.tsx");
  const multiSelectCombobox = read(
    "apps/web/app/components/form/multi-select-combobox.tsx",
  );

  assert.doesNotMatch(sharedCombobox, /ComboboxPrimitive/);
  assert.match(formCombobox, /Combobox as SharedCombobox/);
  assert.match(
    multiSelectCombobox,
    /MultiSelectCombobox as SharedMultiSelectCombobox/,
  );
  assert.match(formCombobox, /matchesSearch/);
  assert.match(multiSelectCombobox, /matchesSearch/);
  assert.doesNotMatch(
    `${formCombobox}\n${multiSelectCombobox}`,
    /@base-ui\/react|ComboboxPrimitive|BaseCombobox\./,
  );
});

test("native visual primitives preserve label, separator, and overflow semantics", () => {
  const label = renderToStaticMarkup(
    createElement(Label, { htmlFor: "amount" }, "Amount"),
  );
  const separator = renderToStaticMarkup(
    createElement(Separator, { decorative: false, orientation: "vertical" }),
  );
  const scrollArea = renderToStaticMarkup(
    createElement(ScrollArea, null, "Scrollable content"),
  );

  assert.match(label, /^<label/);
  assert.match(label, /data-slot="label"/);
  assert.match(label, /for="amount"/);
  assert.match(
    separator,
    /^<div[^>]*data-orientation="vertical"[^>]*role="separator"[^>]*aria-orientation="vertical"/,
  );
  assert.match(scrollArea, /data-slot="scroll-area"/);
  assert.match(scrollArea, /overflow-auto/);
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

  assert.match(drawerSource, /@base-ui\/react\/drawer/);
  assert.match(drawerSource, /DrawerPrimitive\.Viewport/);
  assert.match(drawerSource, /DrawerPrimitive\.Popup/);
  assert.match(drawerSource, /DrawerPrimitive\.Content/);
  assert.match(drawerSource, /fixed inset-x-0 bottom-0/);
  assert.match(drawerSource, /overscroll-contain/);
  assert.match(drawerSource, /motion-reduce:animate-none/);
  assert.match(drawerSource, /responsiveFullscreen = false/);
  assert.match(drawerSource, /before:inset-0/);
  assert.match(drawerSource, /sm:before:inset-2/);
  assert.match(posSource, /<DrawerContent showHandle responsiveFullscreen>/);
  assert.doesNotMatch(drawerSource, /vaul|data-\[vaul/);
  assert.doesNotMatch(posSource, /data-\[vaul/);
  assert.doesNotMatch(archivedOrdersSource, /data-\[vaul/);
  assert.match(
    checkoutApprovalsSource,
    /setRejectTarget\(detailsTarget\);\s*setDetailsTarget\(null\);/,
  );
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

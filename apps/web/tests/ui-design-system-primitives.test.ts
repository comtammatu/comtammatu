import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@comtammatu/ui/components/badge";
import { BreadcrumbLink } from "@comtammatu/ui/components/breadcrumb";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Separator } from "@comtammatu/ui/components/separator";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("Má Tư DS primitive parity files are present in the shared UI package", () => {
  for (const path of [
    "packages/ui/src/components/combobox.tsx",
    "packages/ui/src/components/slider.tsx",
    "packages/ui/src/components/toolbar.tsx",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const designSystem = read("docs/spec/design-system.md");
  assert.match(designSystem, /BrandSymbol/);
  assert.match(designSystem, /Combobox/);
});

// A primitive with no consumer is drift, not coverage: the DS ships only what
// routes actually compose. Without this gate a primitive can sit unimported for
// months while docs, registry, and tests keep asserting it exists.
test("every shared primitive has an importer", () => {
  const uiSourceRoot = resolve(repoRoot, "packages/ui/src");
  const primitives = [
    ...readdirSync(resolve(uiSourceRoot, "components"))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => ({ dir: "components", name, stem: name.slice(0, -4) })),
    ...readdirSync(resolve(uiSourceRoot, "lib"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => ({ dir: "lib", name, stem: name.slice(0, -3) })),
  ];

  const orphans = primitives.filter(({ dir, stem }) => {
    const importers = spawnSync(
      "rg",
      [
        "--files-with-matches",
        "--glob",
        "!node_modules",
        "--glob",
        "!.next",
        "--glob",
        `!packages/ui/src/${dir}/${stem}.*`,
        `from ["'][^"']*/${stem}["']`,
        "apps",
        "packages",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    return (importers.stdout ?? "").trim().length === 0;
  });

  assert.deepEqual(
    orphans.map(({ dir, name }) => `packages/ui/src/${dir}/${name}`),
    [],
    "retire the primitive or wire it into a route; the DS is not a parts catalogue",
  );
});

test("app metrics use KpiCard without the retired Stat primitive", () => {
  const supplierInvoices = read(
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.equal(exists("packages/ui/src/components/stat.tsx"), false);
  assert.doesNotMatch(read("docs/modules/ui.md"), /`stat`/);
  assert.doesNotMatch(supplierInvoices, /import \{ KpiCard \}/);
  assert.doesNotMatch(supplierInvoices, /<KpiCard/);
  assert.doesNotMatch(supplierInvoices, /components\/stat["']|<Stat(?:\s|>)/);
});

test("linked KpiCard applies hover feedback to its full card surface", () => {
  const kpiCard = read("apps/web/app/components/kpi/kpi-card.tsx");

  assert.doesNotMatch(kpiCard, /hover:bg-muted\/50" : undefined/);
  assert.match(kpiCard, /transition-\[background-color,box-shadow\]/);
  assert.match(kpiCard, /hover:bg-muted\/50 hover:shadow-effect-card-hover/);
  assert.match(kpiCard, /compareHint = "so với kỳ trước"/);
  assert.doesNotMatch(kpiCard, /compareHint = "vs kỳ trước"/);
  assert.match(kpiCard, /labelTooltip/);
  assert.match(kpiCard, /decoration-dashed/);
});

test("AppSection and AppPageHeader clamp secondary description copy", () => {
  const surface = [
    "apps/web/app/components/surface/app-section.tsx",
    "apps/web/app/components/surface/app-page-header.tsx",
  ]
    .map((path) => read(path))
    .join("\n");
  const compareChip = read("apps/web/app/components/kpi/compare-chip.tsx");
  const card = read("packages/ui/src/components/card.tsx");

  assert.match(
    surface,
    /CardDescription className="min-w-0 line-clamp-2 break-words"/,
  );
  assert.match(surface, /max-sm:line-clamp-2 max-sm:break-words/);
  assert.match(
    surface,
    /max-w-\[10rem\] shrink-0 truncate[\s\S]*sm:max-w-xs/,
  );
  assert.match(
    compareChip,
    /max-w-\[12rem\] truncate font-normal text-muted-foreground/,
  );
  assert.match(card, /min-w-0 text-xs\/relaxed text-muted-foreground/);
  assert.doesNotMatch(
    card,
    /function CardDescription[\s\S]*?line-clamp-2/,
  );
});

test("shared primitives use Base UI behavior without Radix", () => {
  const badgeSource = read("packages/ui/src/components/badge.tsx");
  const buttonSource = read("packages/ui/src/components/button.tsx");
  const itemSource = read("packages/ui/src/components/item.tsx");
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
  const scrollAreaSource = read("packages/ui/src/components/scroll-area.tsx");
  const switchSource = read("packages/ui/src/components/switch.tsx");
  const sheetSource = read("packages/ui/src/components/sheet.tsx");
  const tabsSource = read("packages/ui/src/components/tabs.tsx");
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
  assert.match(buttonSource, /hover:brightness-90/);
  assert.match(buttonSource, /hover:brightness-95/);
  assert.match(buttonSource, /box-shadow,filter,transform/);
  assert.doesNotMatch(buttonSource, /radix-ui|Slot|asChild/);
  assert.match(itemSource, /@base-ui\/react\/use-render/);
  assert.match(itemSource, /useRender\.ComponentProps<"div">/);
  assert.match(itemSource, /defaultTagName: "div"/);
  assert.doesNotMatch(itemSource, /radix-ui|Slot|asChild/);
  assert.match(alertDialogSource, /@base-ui\/react\/alert-dialog/);
  assert.match(alertDialogSource, /AlertDialogPrimitive\.Backdrop/);
  assert.match(alertDialogSource, /AlertDialogPrimitive\.Popup/);
  assert.doesNotMatch(
    alertDialogSource,
    /radix-ui|AlertDialogPrimitive\.(?:Action|Cancel|Content|Overlay)/,
  );
  assert.match(alertDialogSource, /max-w-\[calc\(100%-2rem\)\]/);
  assert.match(alertDialogSource, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(alertDialogSource, /overscroll-contain/);
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
  assert.equal(
    exists("packages/ui/src/components/command.tsx"),
    false,
    "the custom command adapter should be deleted in favor of Base UI Combobox",
  );
  assert.match(dialogSource, /@base-ui\/react\/dialog/);
  assert.match(dialogSource, /DialogPrimitive\.(?:Backdrop|Popup)/);
  assert.match(dialogSource, /overscroll-contain/);
  assert.match(dialogSource, /size="icon-touch"/);
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
  assert.match(scrollAreaSource, /@base-ui\/react\/scroll-area/);
  assert.match(scrollAreaSource, /ScrollAreaPrimitive\.Viewport/);
  assert.doesNotMatch(scrollAreaSource, /ScrollAreaPrimitive\.Content/);
  assert.doesNotMatch(scrollAreaSource, /radix-ui/);
  assert.match(switchSource, /@base-ui\/react\/switch/);
  assert.doesNotMatch(switchSource, /radix-ui/);
  assert.match(sheetSource, /@base-ui\/react\/dialog/);
  assert.match(sheetSource, /SheetPrimitive\.(?:Backdrop|Popup)/);
  assert.match(sheetSource, /data-\[side=bottom\]:max-h-dvh-95/);
  assert.match(
    sheetSource,
    /data-\[side=bottom\]:pb-\[env\(safe-area-inset-bottom\)\]/,
  );
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
  assert.doesNotMatch(globals, /--radix-/);
  assert.match(uiPackage, /"@base-ui\/react": "1\.6\.0"/);
});

test("foundations bind typography/motion and gate looping Spinner/Skeleton motion", () => {
  const globals = read("packages/ui/src/styles/globals.css");
  const spinner = read("packages/ui/src/components/spinner.tsx");
  const skeleton = read("packages/ui/src/components/skeleton.tsx");
  const sonner = read("packages/ui/src/components/sonner.tsx");
  const designSystem = read("docs/spec/design-system.md");

  assert.match(
    globals,
    /:root\s*\{[^}]*--font-heading:\s*var\(--font-geist-sans\)/,
  );
  assert.match(globals, /html\s*\{[^}]*font-size:\s*17px/);
  assert.match(designSystem, /html \{ font-size: 17px \}/);
  assert.match(globals, /--motion-fast:\s*120ms/);
  assert.match(globals, /--ease-move:\s*cubic-bezier/);
  assert.match(globals, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(spinner, /motion-safe:animate-spin/);
  assert.doesNotMatch(spinner, /(?<!motion-safe:)animate-spin/);
  assert.match(skeleton, /motion-safe:animate-pulse/);
  assert.doesNotMatch(skeleton, /(?<!motion-safe:)animate-pulse/);
  assert.match(sonner, /from ["']\.\/spinner["']/);
  assert.doesNotMatch(sonner, /animate-spin/);
});

test("confirm dialog settles every request exactly once", () => {
  const source = read("apps/web/app/components/confirm-dialog.tsx");

  assert.equal(source.match(/size="touch"/g)?.length, 2);

  // The awaited resolver lives in a ref that is cleared before it is called, so
  // a request can never resolve twice and callers cannot be left pending.
  assert.match(source, /resolveRef = React\.useRef/);
  assert.match(
    source,
    /const resolve = resolveRef\.current;\s*resolveRef\.current = null;\s*resolve\?\.\(result\);/,
  );
  assert.doesNotMatch(source, /pending\?\.resolve/);

  // A superseded request must settle before the next one takes over the dialog.
  assert.match(
    source,
    /settle\(false\);\s*resolveRef\.current = resolve;\s*setOpts\(next\);/,
  );

  // Unmounting the provider releases any caller still awaiting an answer.
  assert.match(source, /React\.useEffect\(\(\) => \(\) => settle\(false\), \[settle\]\)/);
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
  const floatingLayer = read("packages/ui/src/lib/floating-layer.ts");
  const floatingSources = [
    read("packages/ui/src/components/combobox.tsx"),
    read("packages/ui/src/components/context-menu.tsx"),
    read("packages/ui/src/components/dropdown-menu.tsx"),
    read("packages/ui/src/components/popover.tsx"),
    read("packages/ui/src/components/select.tsx"),
    read("packages/ui/src/components/tooltip.tsx"),
  ];

  assert.match(floatingLayer, /FLOATING_POSITION_METHOD = "fixed"/);
  assert.match(floatingLayer, /document\.documentElement/);
  assert.match(selectSource, /positionMethod = FLOATING_POSITION_METHOD/);
  assert.match(
    selectSource,
    /collisionBoundary = floatingCollisionBoundary\(\)/,
  );
  assert.match(
    read("packages/ui/src/components/dropdown-menu.tsx"),
    /positionMethod = FLOATING_POSITION_METHOD/,
  );

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
  const sectionHeading = renderToStaticMarkup(
    createElement(SectionLabel, { as: "h3" }, "Checklist"),
  );

  assert.match(label, /^<label/);
  assert.match(label, /data-slot="label"/);
  assert.match(label, /for="amount"/);
  assert.match(
    separator,
    /^<div[^>]*data-orientation="vertical"[^>]*role="separator"[^>]*aria-orientation="vertical"/,
  );
  assert.match(scrollArea, /data-slot="scroll-area"/);
  assert.match(scrollArea, /data-slot="scroll-area-viewport"/);
  assert.match(sectionHeading, /^<h3/);
  assert.match(sectionHeading, />Checklist<\/h3>$/);
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
  assert.match(drawerSource, /max-h-dvh-80/);
  assert.match(drawerSource, /overscroll-contain/);
  assert.match(
    drawerSource,
    /transition-\[opacity,transform\] duration-\[var\(--motion-drawer\)\] ease-\[var\(--ease-move\)\]/,
  );
  assert.match(
    drawerSource,
    /data-\[starting-style\]:translate-y-full data-\[starting-style\]:opacity-0/,
  );
  assert.doesNotMatch(drawerSource, /motion-reduce:/);
  assert.match(drawerSource, /responsiveFullscreen = false/);
  assert.match(drawerSource, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(drawerSource, /pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(
    drawerSource,
    /flex max-h-dvh-80 flex-col overflow-hidden overscroll-contain/,
  );
  assert.match(
    drawerSource,
    /flex min-h-0 flex-1 flex-col overflow-y-auto/,
  );
  assert.match(drawerSource, /before:inset-0/);
  assert.match(drawerSource, /sm:before:inset-2/);
  assert.match(posSource, /<DrawerContent showHandle responsiveFullscreen>/);
  assert.match(archivedOrdersSource, /useIsMobile\(1280\)/);
  assert.match(
    archivedOrdersSource,
    /<DrawerContent showHandle responsiveFullscreen>/,
  );
  assert.doesNotMatch(drawerSource, /vaul|data-\[vaul/);
  assert.doesNotMatch(drawerSource, /max-h-\[80dvh\]/);
  assert.doesNotMatch(posSource, /data-\[vaul/);
  assert.doesNotMatch(archivedOrdersSource, /data-\[vaul/);
  assert.match(
    checkoutApprovalsSource,
    /setRejectTarget\(detailsTarget\);\s*setDetailsTarget\(null\);/,
  );
});

test("InputGroup controls fill their owning field and touch variants stay named", () => {
  const inputGroup = renderToStaticMarkup(
    createElement(
      InputGroup,
      { size: "touch" },
      createElement(InputGroupInput, { "aria-label": "Search" }),
    ),
  );
  const selectSource = read("packages/ui/src/components/select.tsx");
  const dropdownMenuSource = read(
    "packages/ui/src/components/dropdown-menu.tsx",
  );

  assert.match(inputGroup, /data-slot="input-group"/);
  assert.match(inputGroup, /data-size="touch"/);
  assert.match(inputGroup, /class="[^"]*h-12/);
  assert.match(inputGroup, /class="[^"]*overflow-hidden/);
  assert.match(inputGroup, /data-slot="input-group-control"/);
  assert.match(inputGroup, /h-full/);
  assert.match(selectSource, /size\?: "default" \| "touch"/);
  assert.match(selectSource, /data-\[size=touch\]:min-h-12/);
  assert.match(dropdownMenuSource, /size\?: "default" \| "touch"/);
  assert.match(dropdownMenuSource, /data-\[size=touch\]:min-h-12/);
});

test("Item content regions can shrink inside responsive card layouts", () => {
  const itemSource = read("packages/ui/src/components/item.tsx");

  assert.match(itemSource, /flex min-w-0 flex-1 flex-col gap-1/);
  assert.equal(
    itemSource.match(
      /flex min-w-0 basis-full items-center justify-between gap-2/g,
    )?.length,
    2,
  );
});

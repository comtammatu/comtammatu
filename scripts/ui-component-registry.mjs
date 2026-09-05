import fs from "node:fs";
import path from "node:path";

import {
  PAGE_ARCHETYPES,
  CONTROL_SURFACE_COMPOSE_SHAPES,
} from "./page-archetypes.mjs";

const VALID_ACCESS = new Set([
  "direct",
  "adapter-only",
  "workflow-only",
  "internal",
]);
const VALID_BLOCK_PLANES = new Set([
  "control_surface",
  "branch",
  "staff",
  "station",
  "public",
  "system",
]);

function decision(access, need, use, fallback, forbidden, exemplar) {
  return { access, need, use, fallback, forbidden, exemplar };
}

const direct = (...args) => decision("direct", ...args);
const adapterOnly = (...args) => decision("adapter-only", ...args);
const workflowOnly = (...args) => decision("workflow-only", ...args);
const internal = (...args) => decision("internal", ...args);

export const SHARED_COMPONENT_REGISTRY = {
  "alert-dialog.tsx": adapterOnly(
    "destructive confirmation internals",
    "confirm() or ReasonConfirmDialog",
    "FormDialog when input is required",
    "route-authored AlertDialog composition",
    "shared destructive confirmation flow",
  ),
  "alert.tsx": direct(
    "semantic inline alert",
    "Alert or NoteCallout",
    "AppEmptyState for full-panel failure",
    "raw tinted bordered callout",
    "validation and operational warning callouts",
  ),
  "avatar.tsx": direct(
    "person or entity identity media",
    "Avatar",
    "initials fallback through AvatarFallback",
    "hand-rolled circular identity block",
    "employee identity rows",
  ),
  "badge.tsx": direct(
    "generic categorical metadata",
    "Badge",
    "StatusBadge for business workflow state",
    "page-local business status color maps",
    "counts, scope, and non-state metadata",
  ),
  "breadcrumb.tsx": adapterOnly(
    "page hierarchy navigation",
    "AppPageHeader breadcrumb slot",
    "in-flow back action for operator routes",
    "route-local breadcrumb chrome",
    "management detail headers",
  ),
  "button.tsx": direct(
    "command or action",
    "Button with a named size variant",
    "Link rendered through Button render for navigation commands",
    "raw button or route-local height patch",
    "all app command surfaces",
  ),
  "calendar.tsx": adapterOnly(
    "calendar selection internals",
    "BusinessDateField, BusinessDatePicker, or BusinessWeekPicker",
    "named month-board adapters for heatmaps",
    "route-authored Calendar popover, type=date, or DayPicker as a heatmap",
    "business-date form fields",
  ),
  "card.tsx": adapterOnly(
    "surface framing internals",
    "AppSection, StationSection, PublicSection, AppLinkCard, KpiCard, InteractiveCard, or OperationalBoardCard",
    "document or item composition when no card role applies",
    "raw Card import in route code without a documented role",
    "approved app surface adapters",
  ),
  "checkbox.tsx": direct(
    "independent boolean or multi-select option",
    "Checkbox inside Field",
    "Switch for immediate settings changes",
    "clickable div checkbox imitation",
    "form and bulk-selection controls",
  ),
  "collapsible.tsx": direct(
    "single disclosure region",
    "Collapsible",
    "Accordion for multiple coordinated sections",
    "manual hidden state and chevron wiring",
    "optional detail sections",
  ),
  "combobox.tsx": adapterOnly(
    "searchable selection",
    "app Form Combobox or MultiSelectCombobox",
    "SelectField for a small fixed option set",
    "route-local scattered picker assembly",
    "shared form combobox adapters",
  ),
  "compare-chip.tsx": direct(
    "metric period-over-period delta",
    "CompareChip or buildCompareDelta",
    "plain text when no signed comparison exists",
    "route-local up/down color chip",
    "KpiCard and report section deltas",
  ),
  "confirm-dialog.tsx": direct(
    "destructive confirmation flow",
    "confirm(), ConfirmDialog, or ConfirmDialogProvider",
    "ReasonConfirmDialog when a reason is required",
    "raw AlertDialog composition",
    "delete, void, and irreversible command confirmation",
  ),
  "context-menu.tsx": workflowOnly(
    "advanced row action opened by right click or long press",
    "ContextMenu",
    "RowActionsMenu for visible click actions",
    "using context menu as the only path to a required action",
    "advanced data-row actions",
  ),
  "data-table-pagination.tsx": internal(
    "DataTable page controls",
    "DataTable pagination slot",
    "URL-owned paging chrome composed by the route loader",
    "route-authored table pager",
    "shared DataTable implementation",
  ),
  "data-table.tsx": direct(
    "searchable responsive list",
    "DataTable",
    "ItemGroup for a short non-tabular list",
    "raw Table or duplicate mobile tree",
    "inventory and HR lists",
  ),
  "dialog.tsx": adapterOnly(
    "modal overlay internals",
    "AppDialog, FormDialog, or FileImportDialog",
    "Sheet or Page for long multi-step work",
    "raw Dialog composition in route code",
    "shared app dialog adapters",
  ),
  "drawer.tsx": adapterOnly(
    "mobile-first contextual task overlay internals",
    "AppDrawer or StationSheet",
    "AppSheet or Page when content is long or desktop-primary",
    "route-authored Drawer composition",
    "shared app drawer adapters",
  ),
  "dropdown-menu.tsx": workflowOnly(
    "compact option or action menu",
    "DropdownMenu or RowActionsMenu",
    "Select for choosing one value",
    "hiding the primary action in an overflow menu",
    "secondary and row overflow actions",
  ),
  "empty.tsx": adapterOnly(
    "empty-state internals",
    "AppEmptyState or TableEmptyStateRow",
    "NotFoundPanel or ErrorPanel for route boundaries",
    "raw Empty import in route code",
    "shared empty-state adapters",
  ),
  "field.tsx": direct(
    "form field semantics and messages",
    "Field, FieldGroup, and shared form controls",
    "app field wrapper that delegates to Field",
    "raw label and input spacing without field semantics",
    "all structured forms",
  ),
  "frame.tsx": workflowOnly(
    "bounded media or content frame",
    "Frame when the content contract needs a stable frame",
    "AppSection for a normal content section",
    "decorative nested card framing",
    "media and preview surfaces",
  ),
  "input-group.tsx": direct(
    "input with prefix, suffix, or inline action",
    "InputGroup with InputGroupInput or another direct shared input control",
    "Field plus Input for a plain field",
    "absolute-positioned addon or repeated child border/ring reset classes",
    "search and unit-aware inputs",
  ),
  "input.tsx": direct(
    "single-line text or numeric control",
    "TextField for standard RHF fields; direct Input only inside Field/FormField, native browser workflows, or a specialized composition",
    "InputGroup for search/addons or FormattedNumberInput for localized numeric entry",
    "unstyled native input, raw Label plus Input anatomy, or route-local control height",
    "date/file controls, identifiers, and inline editors",
  ),
  "interactive-card.tsx": direct(
    "selectable card-shaped row",
    "InteractiveCard with a semantic render target",
    "Item for a compact information row",
    "raw clickable card markup",
    "inventory and operator mobile cards",
  ),
  "item.tsx": direct(
    "structured list row or compact information block",
    "Item and ItemGroup",
    "DataTable for columnar searchable data",
    "raw bordered row clone",
    "operator and employee action rows",
  ),
  "kbd.tsx": direct(
    "keyboard key representation",
    "Kbd",
    "plain text when the key is not an interactive hint",
    "hand-styled keyboard capsule",
    "desktop command hints",
  ),
  "kpi-card.tsx": direct(
    "metric value card",
    "KpiCard",
    "DescriptionList for metadata rows",
    "local StatCard or SummaryCard",
    "finance and HR metrics",
  ),
  "label.tsx": direct(
    "control label primitive",
    "FieldLabel or Label with an associated control",
    "Field wrapper for complete field semantics",
    "unassociated visual label text",
    "specialized control composition",
  ),
  "note-callout.tsx": direct(
    "instructional or warning callout",
    "NoteCallout",
    "Alert for semantic alert content",
    "raw tinted bordered note",
    "document and form guidance",
  ),
  "popover.tsx": workflowOnly(
    "small anchored contextual surface",
    "Popover",
    "Tooltip for non-essential hover help or Dialog for a task",
    "popover containing a long multi-step workflow",
    "pickers and compact contextual controls",
  ),
  "progress.tsx": direct(
    "determinate progress",
    "Progress",
    "Spinner for indeterminate waiting",
    "raw width-based progress chrome",
    "upload and completion progress",
  ),
  "radio-group.tsx": direct(
    "single choice among visible options",
    "RadioGroup",
    "Select for a compact option set",
    "custom selected-card state without radio semantics",
    "form mode choices",
  ),
  "reason-confirm-dialog.tsx": direct(
    "confirmation with required reason input",
    "ReasonConfirmDialog",
    "confirm() for simple yes or no confirmation",
    "route-local reason modal",
    "void, cancel, and rejection flows with mandatory reason",
  ),
  "row-actions-menu.tsx": direct(
    "row overflow actions",
    "RowActionsMenu",
    "visible Button for the primary row action",
    "route-local dropdown action menu",
    "management tables",
  ),
  "scroll-area.tsx": workflowOnly(
    "bounded custom scroll region",
    "ScrollArea with a definite height or flex constraint",
    "normal document flow or DataTable scrolling",
    "max-height-only ScrollArea",
    "constrained sheets and panels",
  ),
  "section-label.tsx": direct(
    "eyebrow or section label role",
    "SectionLabel",
    "plain body text when the label role does not apply",
    "inline uppercase tracking class string",
    "panel and field eyebrow labels",
  ),
  "select.tsx": direct(
    "single choice from a compact fixed set",
    "Select or SelectField",
    "Combobox for searchable or large sets",
    "custom menu pretending to be a select",
    "form option selection",
  ),
  "separator.tsx": direct(
    "semantic visual separation",
    "Separator",
    "spacing alone when no divider is needed",
    "raw border used only as a decorative separator",
    "toolbars and grouped content",
  ),
  "sheet.tsx": adapterOnly(
    "edge-mounted contextual task internals",
    "AppSheet or StationSheet",
    "AppDrawer for a short touch task or Page for long document work",
    "route-authored Sheet composition",
    "shared app sheet adapters",
  ),
  "skeleton.tsx": workflowOnly(
    "shape-preserving local loading placeholder",
    "Skeleton inside an approved adapter or PageSkeleton",
    "PageSpinner for realtime boards",
    "route-local fake operational data skeleton",
    "form, table, and page loading adapters",
  ),
  "slider.tsx": direct(
    "bounded numeric adjustment",
    "Slider with a visible value",
    "numeric input or stepper for exact values",
    "unlabeled slider",
    "settings with continuous ranges",
  ),
  "sonner.tsx": workflowOnly(
    "transient feedback",
    "toast API with the shared Toaster mount",
    "inline error for recoverable field or panel state",
    "URL flash messages or a second toaster provider",
    "save and command feedback",
  ),
  "spinner.tsx": direct(
    "indeterminate waiting",
    "Spinner or PageSpinner",
    "Skeleton when preserving layout matters",
    "Loader icon plus animate-spin",
    "button and panel pending states",
  ),
  "status-badge.tsx": direct(
    "business workflow status",
    "StatusBadge or getStatusBadgeMeta",
    "Badge for non-state metadata",
    "route-local status label and color map",
    "attendance and inventory states",
  ),
  "switch.tsx": direct(
    "immediate binary setting",
    "Switch inside Field",
    "Checkbox when submission is deferred or selection is additive",
    "button with custom on and off visuals",
    "settings toggles",
  ),
  "table-empty-state-row.tsx": internal(
    "empty state inside a table",
    "DataTable empty slot",
    "AppEmptyState outside a table",
    "custom colspan empty row",
    "shared DataTable implementation",
  ),
  "table.tsx": adapterOnly(
    "table markup internals",
    "DataTable or TableEmptyStateRow",
    "document line adapter with an explicit contract",
    "raw Table import or native table in route code",
    "shared DataTable implementation",
  ),
  "tabs.tsx": direct(
    "segmented view selection",
    "TabsList layout=equal|scroll or AppPageTabs",
    "URL navigation when views are separate routes",
    "duplicate chips and tabs for the same facet",
    "page subviews and POS modes",
  ),
  "textarea.tsx": direct(
    "multi-line text entry",
    "Textarea inside Field or TextareaField",
    "Input for short single-line values",
    "contenteditable div for plain text",
    "notes and reasons",
  ),
  "theme-provider.tsx": internal(
    "root theme state",
    "the single root ThemeProvider",
    "theme cookie and ThemeToggle contract",
    "route-local theme provider or localStorage theme state",
    "root app layout",
  ),
  "theme-script.tsx": internal(
    "pre-hydration theme bootstrap",
    "getThemeScriptHtml at the root",
    "server-selected light mode fallback",
    "route-authored theme script",
    "root document bootstrap",
  ),
  "toggle-group.tsx": direct(
    "compact mutually related toggle choices",
    "ToggleGroup",
    "Tabs when each choice changes the rendered view",
    "independent buttons with duplicated selected-state logic",
    "view and density controls",
  ),
  "toggle.tsx": direct(
    "single pressable formatting or mode toggle",
    "Toggle",
    "Switch for a persistent binary setting",
    "button with page-local selected classes",
    "compact tool controls",
  ),
  "toolbar.tsx": adapterOnly(
    "toolbar layout internals",
    "AppToolbar or PwaToolbar",
    "Button group for a very small command cluster",
    "route-local bordered toolbar clone",
    "filters and operational toolbars",
  ),
  "tooltip.tsx": workflowOnly(
    "non-essential pointer or focus help",
    "Tooltip with accessible trigger content",
    "visible text, tap expansion, or NoteCallout on touch workflows",
    "tooltip as the only source of required information",
    "desktop icon clarification",
  ),
};

function adapter(
  source,
  need,
  use,
  fallback,
  forbidden,
  exemplar,
  audit = false,
) {
  return { source, need, use, fallback, forbidden, exemplar, audit };
}

export const APP_ADAPTER_REGISTRY = {
  AppPage: adapter(
    "apps/web/app/components/surface/app-page.tsx",
    "page container",
    "AppPage",
    "fullscreen route contract",
    "route-local width and padding wrapper",
    "management content page",
    true,
  ),
  AppPageHeader: adapter(
    "apps/web/app/components/surface/app-page-header.tsx",
    "page heading",
    "AppPageHeader",
    "operator-owned chrome",
    "hand-rolled page H1",
    "management page header",
    true,
  ),
  AppBackLink: adapter(
    "apps/web/app/components/surface/app-page-header.tsx",
    "back navigation affordance",
    "AppBackLink",
    "Button render ghost icon Link for a combined back-plus-title row",
    "route-local ArrowLeft anchor with duplicated classes",
    "AppPageHeader breadcrumb slot",
  ),
  AppShellPaddingBoundary: adapter(
    "apps/web/app/components/surface/app-page.tsx",
    "shell padding ownership",
    "AppShellPaddingBoundary",
    "AppPage owns padding when no shell does",
    "nested padding compensation",
    "AppShell main region",
  ),
  AppSection: adapter(
    "apps/web/app/components/surface/app-section.tsx",
    "content section",
    "AppSection",
    "Item for a compact row",
    "raw bordered card section",
    "detail and form sections",
    true,
  ),
  StationSection: adapter(
    "apps/web/app/components/surface/station-section.tsx",
    "station_chrome framed sections",
    "StationSection",
    "Frame for a non-section bordered region",
    "AppSection on station routes",
    "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx",
    true,
  ),
  PublicSection: adapter(
    "apps/web/app/components/surface/public-section.tsx",
    "public and system-gate framed sections",
    "PublicSection",
    "Item or Frame for a non-section bordered region",
    "AppSection on public or guest routes",
    "apps/web/app/(public)/access-denied/page.tsx",
    true,
  ),
  AppToolbar: adapter(
    "apps/web/app/components/surface/app-toolbar.tsx",
    "filter and command toolbar",
    "AppToolbar",
    "DataTable toolbar slots",
    "route-local toolbar chrome",
    "list filters",
    true,
  ),
  AppSegmentedControl: adapter(
    "apps/web/app/components/surface/app-segmented-control.tsx",
    "segmented pill control for view switching and mode toggling",
    "AppSegmentedControl",
    "Tabs for full-page subviews or ToggleGroup for formatting options",
    "hand-rolled Frame plus Button cluster with duplicated active classes",
    "work list view switcher and operational mode toggles",
    true,
  ),
  AppFilterChips: adapter(
    "apps/web/app/components/surface/app-filter-chips.tsx",
    "horizontal filter chips with semantic counts",
    "AppFilterChips",
    "Select for long option lists",
    "hand-rolled div plus button cluster with custom active backgrounds",
    "quick filter bar for overdue and urgent tasks",
    true,
  ),
  AppFilterChipsBar: adapter(
    "apps/web/app/components/surface/app-filter-chips.tsx",
    "bordered bar container for AppFilterChips below toolbars",
    "AppFilterChipsBar",
    "AppFilterChips for inline chip clusters",
    "hand-rolled border-t div below toolbar",
    "work list toolbar quick filter subbar",
  ),
  DocumentFormFrame: adapter(
    "apps/web/app/components/surface/document-form-frame.tsx",
    "document line workflow",
    "DocumentFormFrame",
    "AppPage plus AppDetailFooter",
    "hand-rolled document shell",
    "GRN and purchase order forms",
    true,
  ),
  AppListFrame: adapter(
    "apps/web/app/components/surface/app-list-frame.tsx",
    "control_surface LIST section with optional inline toolbar",
    'AppListFrame toolbar={<AppToolbar variant="inline" />} wrapping DataTable',
    "AppSection contentFlush plus a separate AppToolbar card when filters scope multiple sections",
    "route-local list card or separate mobile and desktop trees",
    "HR employee, leave, and staff lists",
    true,
  ),
  SettingsPageFrame: adapter(
    "apps/web/app/(protected)/settings/settings-page-frame.tsx",
    "settings page shell with home breadcrumb",
    "SettingsPageFrame",
    "AppPage plus AppPageHeader for a one-off settings surface",
    "route-local settings card chrome",
    "tenant and printer settings pages",
  ),
  OperationalTile: adapter(
    "apps/web/app/components/surface/operational.tsx",
    "large selectable action",
    "OperationalTile",
    "Button size=tile",
    "clickable div tile",
    "POS context selection",
  ),
  OperationalBoardCard: adapter(
    "apps/web/app/components/surface/operational.tsx",
    "operational board item",
    "OperationalBoardCard",
    "Item for a compact row",
    "generic dashboard card",
    "POS and KDS boards",
  ),
  AppEmptyState: adapter(
    "apps/web/app/components/surface/app-empty-state.tsx",
    "empty or panel error state",
    "AppEmptyState",
    "TableEmptyStateRow inside a table",
    "route-local empty block",
    "list and detail empty states",
    true,
  ),
  AppLinkCard: adapter(
    "apps/web/app/components/surface/app-link-card.tsx",
    "navigation card",
    "AppLinkCard",
    "Item render for a compact link",
    "raw clickable card",
    "management hubs",
    true,
  ),
  LinkCardGrid: adapter(
    "apps/web/app/components/surface/app-link-card.tsx",
    "navigation card grid",
    "LinkCardGrid",
    "ItemGroup for row actions",
    "route-local responsive card grid",
    "management hubs",
  ),
  KpiRow: adapter(
    "apps/web/app/components/surface/kpi-row.tsx",
    "metric row layout",
    "KpiRow",
    "DescriptionList for non-metrics",
    "generic card grid for values",
    "finance overview",
  ),
  DescriptionList: adapter(
    "apps/web/app/components/surface/description-list.tsx",
    "term and value detail",
    "DescriptionList",
    "DataTable for repeated records",
    "KPI cards for metadata",
    "record detail",
  ),
  AppDetailFooter: adapter(
    "apps/web/app/components/surface/app-detail-footer.tsx",
    "detail action footer",
    "AppDetailFooter",
    "normal flow actions for short pages",
    "fixed footer with local offsets",
    "document detail",
    true,
  ),
  AppBoardGrid: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "Kanban and operational task board container",
    "AppBoardGrid",
    "AppListFrame for tabular list views",
    "route-local horizontal scroll grid",
    "work board and operational queues",
    true,
  ),
  AppBoardColumn: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "Kanban board column with drag-and-drop support",
    "AppBoardColumn",
    "Frame for custom bordered boxes",
    "route-local column styling with raw padding",
    "work board columns",
    true,
  ),
  AppBoardColumnHeader: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "Kanban column header with title, count badge, and indicator",
    "AppBoardColumnHeader",
    "SectionLabel for raw text labels",
    "hand-rolled column headers",
    "work board columns",
  ),
  AppBoardCard: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "Kanban task/item card with priority and metadata",
    "AppBoardCard",
    "Item for standard list rows",
    "raw Card or div pretending to be a task card",
    "work board tasks",
    true,
  ),
  AppBoardStatusDropdown: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "status badge button with quick-transition dropdown menu",
    "AppBoardStatusDropdown",
    "StatusBadge for read-only status",
    "route-local dropdown trigger clones",
    "work board card quick status change",
    true,
  ),
  AppBoardCompletedSection: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "collapsible completed section at bottom of board column",
    "AppBoardCompletedSection",
    "Collapsible for general disclosures",
    "uncontrolled collapsible div",
    "work board completed tasks",
  ),
  AppBoardColumnAction: adapter(
    "apps/web/app/components/surface/app-board.tsx",
    "fixed action button at bottom of board column",
    "AppBoardColumnAction",
    "Button with dashed border",
    "hand-rolled column footer button",
    "work board add task action",
  ),
  AppInspectorGrid: adapter(
    "apps/web/app/components/surface/app-inspector-grid.tsx",
    "2-column inspector layout for management detail and review",
    "AppInspectorGrid",
    "AppPage for simple single-column content",
    "hand-rolled responsive grid with ad-hoc breakpoints",
    "work task detail and document inspection",
    true,
  ),
  AppInspectorMain: adapter(
    "apps/web/app/components/surface/app-inspector-grid.tsx",
    "main content column in 2-column inspector layout",
    "AppInspectorMain",
    "plain div with local flex styles",
    "misaligned column span",
    "work task detail body",
  ),
  AppInspectorSidebar: adapter(
    "apps/web/app/components/surface/app-inspector-grid.tsx",
    "metadata inspector sidebar with optional sticky behavior",
    "AppInspectorSidebar",
    "plain div with local sticky styles",
    "sidebar outside inspector grid",
    "work task detail sidebar",
  ),
  AppInspectorSection: adapter(
    "apps/web/app/components/surface/app-inspector-grid.tsx",
    "grouped metadata card section inside inspector",
    "AppInspectorSection",
    "AppSection for full-page sections",
    "raw Card without inspector rhythm",
    "work task detail property cards",
  ),
  AppInspectorRow: adapter(
    "apps/web/app/components/surface/app-inspector-grid.tsx",
    "label and control/value row in inspector section",
    "AppInspectorRow",
    "FormField for standard form layout",
    "raw label without font styling",
    "work task detail property fields",
  ),
  AppHeader: adapter(
    "apps/web/app/components/app-header.tsx",
    "shared app chrome header",
    "AppHeader",
    "operator toolbar when the route owns operational chrome",
    "route-local brand header",
    "management shell",
    true,
  ),
  AppBoneyardSkeleton: adapter(
    "apps/web/app/_components/boneyard-skeleton.tsx",
    "shared application boot skeleton",
    "AppBoneyardSkeleton",
    "PageSkeleton for a route",
    "route-local app-shell skeleton",
    "protected root loading",
    true,
  ),
  DataTable: adapter(
    "apps/web/app/components/data-table/data-table.tsx",
    "searchable responsive list",
    "DataTable",
    "ItemGroup for a short non-tabular list",
    "raw Table or duplicate mobile tree",
    "inventory and HR lists",
    true,
  ),
  AppDialog: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "detail or short task modal",
    "AppDialog",
    "AppSheet or Page for long work",
    "raw Dialog composition",
    "record detail task",
    true,
  ),
  AppSheet: adapter(
    "apps/web/app/components/surface/app-sheet.tsx",
    "D1 record beside a list",
    "AppSheet",
    "StationSheet on POS/KDS/guest, AppDialog for short modal work",
    "raw Sheet composition in a route",
    "finance invoice and order detail sheets",
    true,
  ),
  StationSheet: adapter(
    "apps/web/app/components/surface/station-sheet.tsx",
    "station or guest overlay",
    "StationSheet",
    "AppSheet on control_surface D1",
    "AppDialog, AppSection, or raw Sheet on station gold",
    "POS order-detail and self-order cart",
    true,
  ),
  AppDrawer: adapter(
    "apps/web/app/components/surface/app-drawer.tsx",
    "short touch task overlay",
    "AppDrawer",
    "AppSheet when the panel is desktop-primary",
    "raw Drawer composition in a route",
    "branch team member drawer",
    true,
  ),
  PwaInstallHelpDialog: adapter(
    "apps/web/app/components/pwa-install-help-dialog.tsx",
    "PWA installation help",
    "PwaInstallHelpDialog",
    "inline platform hint when no modal task is needed",
    "route-local install instructions dialog",
    "install recovery from app chrome",
    true,
  ),
  ConfirmDialog: adapter(
    "apps/web/app/components/confirm-dialog.tsx",
    "controlled yes or no confirmation",
    "ConfirmDialog",
    "confirm() for imperative destructive flows",
    "route-local AlertDialog",
    "form and task confirmation",
    true,
  ),
  ConfirmDialogProvider: adapter(
    "apps/web/app/components/confirm-dialog.tsx",
    "global confirm() host",
    "ConfirmDialogProvider mounted once in root layout",
    "ConfirmDialog for controlled confirmation",
    "route-local confirm bus",
    "delete, void, and irreversible command confirmation",
    true,
  ),
  confirm: adapter(
    "apps/web/app/components/confirm-dialog.tsx",
    "simple yes or no confirmation",
    "confirm() with ConfirmDialogProvider mounted once",
    "ReasonConfirmDialog when a reason is required",
    "window.confirm or route-local AlertDialog",
    "delete, void, and irreversible command confirmation",
    true,
  ),
  ReasonConfirmDialog: adapter(
    "apps/web/app/components/reason-confirm-dialog.tsx",
    "confirmation with a required reason",
    "ReasonConfirmDialog",
    "FormDialog for multiple structured fields",
    "route-local reason modal",
    "reject and cancellation flows",
    true,
  ),
  ChartContainer: adapter(
    "apps/web/app/components/chart.tsx",
    "report visualization",
    "ChartContainer and chart helpers inside a report contract",
    "DataTable when exact values are the primary job",
    "decorative dashboard chart without an operational metric contract",
    "finance and inventory reports",
    true,
  ),
  SidebarProvider: adapter(
    "apps/web/app/components/sidebar.tsx",
    "management navigation chrome internals",
    "SidebarProvider via AppShell or ControlSurfaceShell",
    "AppBottomNav for operator navigation",
    "route-local SidebarProvider or third shell",
    "management shell",
    true,
  ),
  useSidebar: adapter(
    "apps/web/app/components/sidebar.tsx",
    "sidebar layout state",
    "useSidebar inside AppShell chrome",
    "AppBottomNav for operator navigation",
    "route-local sidebar state",
    "management shell",
    true,
  ),
  FormDialog: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "CRUD form modal",
    "FormDialog",
    "Page or Sheet for many lines",
    "Dialog plus useForm plus zodResolver",
    "employee CRUD",
    true,
  ),
  FormSheet: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "Branch short CRUD overlay",
    "FormSheet",
    "AppSheet for a non-RHF decision",
    "FormDialog on Branch operator",
    "branch table create",
    true,
  ),
  FileImportDialog: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "file import workflow",
    "FileImportDialog",
    "Page for a complex import review",
    "route-local upload dialog",
    "CSV import",
    true,
  ),
  AppFormGrid: adapter(
    "apps/web/app/components/form/app-form-grid.tsx",
    "responsive 2-column form grid for dialogs, sheets, and popups",
    "AppFormGrid",
    "FieldGroup for simple vertical forms",
    "ad-hoc grid-cols-1 sm:grid-cols-2 div with mismatched gaps",
    "quick task create and incident report dialogs",
    true,
  ),
  AppFormRow: adapter(
    "apps/web/app/components/form/app-form-grid.tsx",
    "column-spanning row or sub-row inside AppFormGrid",
    "AppFormRow",
    "col-span-full class directly on input field",
    "unwrapped full-width field in 2-column grid causing alignment drift",
    "full-width title or description row",
  ),
  AppFormSection: adapter(
    "apps/web/app/components/form/app-form-grid.tsx",
    "grouped section with eyebrow header inside form grid",
    "AppFormSection",
    "AppSection for full-page sections",
    "nested card or raw fieldset with border",
    "categorized form fields",
  ),
  TextField: adapter(
    "apps/web/app/components/form/text-field.tsx",
    "text form field",
    "TextField",
    "Field plus Input for special composition",
    "raw label and input spacing",
    "standard forms",
  ),
  FormField: adapter(
    "apps/web/app/components/form/form-field.tsx",
    "labeled non-RHF or specialized field composition",
    "FormField with a shared control and explicit id/ARIA state",
    "Field for low-level adapter internals or TextField for standard RHF text",
    "raw Label plus control spacing in route code",
    "controlled select, combobox, textarea, and specialized input fields",
  ),
  FormattedNumberInput: adapter(
    "apps/web/app/components/form/formatted-number-input.tsx",
    "localized numeric entry",
    "FormattedNumberInput",
    "NumberField for labeled use",
    "page-local number parsing",
    "quantity and money inputs",
  ),
  NumberField: adapter(
    "apps/web/app/components/form/number-field.tsx",
    "labeled numeric field",
    "NumberField",
    "FormattedNumberInput for custom composition",
    "raw number input with local formatting",
    "general numeric forms",
  ),
  NumberPadSheet: adapter(
    "apps/web/app/components/form/number-pad-sheet.tsx",
    "touch numeric entry",
    "NumberPadSheet",
    "NumberField on keyboard-first surfaces",
    "custom keypad overlay",
    "POS and count input",
  ),
  NumberPadGrid: adapter(
    "apps/web/app/components/form/number-pad-grid.tsx",
    "numeric keypad internals",
    "NumberPadGrid inside an approved numeric workflow",
    "NumberPadSheet",
    "route-local keypad implementation",
    "shared touch number pad",
  ),
  MoneyVndField: adapter(
    "apps/web/app/components/form/domain-number-inputs.tsx",
    "VND field",
    "MoneyVndField",
    "NumberField for non-money values",
    "local currency parser",
    "finance forms",
  ),
  MoneyVndInput: adapter(
    "apps/web/app/components/form/domain-number-inputs.tsx",
    "VND input control",
    "MoneyVndInput",
    "MoneyVndField for labeled use",
    "local currency input",
    "composed finance controls",
  ),
  QuantityField: adapter(
    "apps/web/app/components/form/domain-number-inputs.tsx",
    "quantity field",
    "QuantityField",
    "NumberField for non-domain numbers",
    "local quantity parser",
    "inventory forms",
  ),
  QuantityInput: adapter(
    "apps/web/app/components/form/domain-number-inputs.tsx",
    "quantity input control",
    "QuantityInput",
    "QuantityField for labeled use",
    "local quantity input",
    "inventory line editors",
  ),
  BusinessDateField: adapter(
    "apps/web/app/components/form/business-date-field.tsx",
    "Vietnam business date",
    "BusinessDateField",
    "BusinessDatePicker for non-form composition",
    "route-local date formatting or type=date",
    "finance and inventory forms",
  ),
  BusinessDatePicker: adapter(
    "apps/web/app/components/form/business-date-field.tsx",
    "filter or URL business date",
    "BusinessDatePicker",
    "BusinessDateField for RHF forms",
    "native date input or cloned Calendar popover",
    "list filters",
  ),
  BusinessWeekPicker: adapter(
    "apps/web/app/components/form/business-date-field.tsx",
    "week-range calendar highlight",
    "BusinessWeekPicker",
    "BusinessDatePicker for a single day",
    "route-authored Calendar modifiers",
    "finance calendar period week",
  ),
  AttendanceMonthGrid: adapter(
    "apps/web/app/(protected)/hr/attendance-calendar.tsx",
    "attendance month heatmap",
    "AttendanceCalendar",
    "BusinessDatePicker for a single date",
    "ui/calendar DayPicker as a heatmap",
    "HR attendance calendar",
  ),
  WorkMonthGrid: adapter(
    "apps/web/app/(protected)/work/_components/compose/work-month-grid.tsx",
    "work task month board",
    "WorkMonthGrid",
    "BusinessDateField for editing due_at",
    "ui/calendar DayPicker for task month view",
    "work calendar compose",
  ),
  RosterWeek: adapter(
    "apps/web/lib/hr/roster/roster-week-client.tsx",
    "roster week board",
    "RosterWeekClient",
    "AttendanceMonthGrid for a month heatmap",
    "ui/calendar DayPicker as a week grid",
    "HR roster week",
  ),
  ChartCard: adapter(
    "apps/web/app/components/chart-card.tsx",
    "chart section shell",
    "ChartCard",
    "SimpleBarChart as a chart child, not a second card",
    "parallel finance/inventory chart card clones",
    "finance revenue charts",
  ),
  SelectField: adapter(
    "apps/web/app/components/form/select-field.tsx",
    "labeled fixed-option selection",
    "SelectField",
    "Combobox for a searchable set",
    "local Select trigger sizing",
    "standard forms",
  ),
  TextareaField: adapter(
    "apps/web/app/components/form/textarea-field.tsx",
    "labeled multi-line text",
    "TextareaField",
    "Field plus Textarea for special composition",
    "raw textarea spacing",
    "notes and reasons",
  ),
  Combobox: adapter(
    "apps/web/app/components/form/combobox.tsx",
    "searchable form selection",
    "Combobox",
    "SelectField for a small set",
    "route-local picker assembly",
    "supplier and ingredient selection",
  ),
  MultiSelectCombobox: adapter(
    "apps/web/app/components/form/multi-select-combobox.tsx",
    "searchable multi-selection",
    "MultiSelectCombobox",
    "comma-delimited plain text without token feedback",
    "route-local multi-select",
    "staff and catalog filters",
  ),
  KpiCard: adapter(
    "apps/web/app/components/kpi/kpi-card.tsx",
    "metric value",
    "KpiCard",
    "DescriptionList for metadata",
    "local StatCard or SummaryCard",
    "finance and HR metrics",
    true,
  ),
  StatusBadge: adapter(
    "apps/web/app/components/status-badge.tsx",
    "business workflow status",
    "StatusBadge",
    "Badge for non-state metadata",
    "route-local status label and color map",
    "attendance and inventory states",
    true,
  ),
  TableEmptyStateRow: adapter(
    "apps/web/app/components/table-empty-state-row.tsx",
    "empty state inside a table",
    "TableEmptyStateRow",
    "AppEmptyState outside a table",
    "custom colspan empty row",
    "DataTable empty state",
    true,
  ),
  PageSkeleton: adapter(
    "apps/web/app/components/page-skeleton.tsx",
    "route loading frame",
    "PageSkeleton",
    "PageSpinner for realtime boards",
    "route-local skeleton layout",
    "management route loading",
    true,
  ),
  PageSpinner: adapter(
    "apps/web/app/components/page-skeleton.tsx",
    "realtime or indeterminate route loading",
    "PageSpinner",
    "PageSkeleton for stable management layouts",
    "fake board skeleton",
    "KDS and pickup loading",
    true,
  ),
  ErrorPanel: adapter(
    "apps/web/app/components/error-panel.tsx",
    "route error boundary",
    "ErrorPanel",
    "AppEmptyState for an inline recoverable error",
    "route-local error panel",
    "error.tsx",
    true,
  ),
  NotFoundPanel: adapter(
    "apps/web/app/components/not-found-panel.tsx",
    "not-found boundary",
    "NotFoundPanel",
    "AppEmptyState for an empty collection",
    "route-local not-found markup",
    "not-found.tsx",
    true,
  ),
  RowActionsMenu: adapter(
    "apps/web/app/components/row-actions-menu.tsx",
    "row overflow actions",
    "RowActionsMenu",
    "visible Button for the primary row action",
    "route-local dropdown action menu",
    "management tables",
    true,
  ),
  SettingsFormSection: adapter(
    "apps/web/app/components/settings-form-section.tsx",
    "settings form section",
    "SettingsFormSection",
    "AppSection for non-settings content",
    "settings-specific card clone",
    "owner settings",
    true,
  ),
  AppPageTabs: adapter(
    "apps/web/app/components/app-page-tabs.tsx",
    "page-level segmented views",
    "AppPageTabs (responsive scroll layout)",
    "route navigation for separate pages",
    "route-local tab strip",
    "management page tabs",
  ),
  PwaToolbar: adapter(
    "apps/web/app/components/pwa-toolbar.tsx",
    "operator PWA toolbar",
    "PwaToolbar",
    "AppHeader for management chrome",
    "route-local operator header",
    "branch operational shell",
  ),
};

export const DOMAIN_ADAPTER_FAMILIES = {
  "branch-operator": {
    source: "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
    prefix: "BranchOperator",
    need: "touch-first Branch runtime composition",
    fallback: "shared canonical PageContent with explicit embedded mode",
    forbidden:
      "AppShell, AppListFrame, DocumentFormFrame, DataTable on Branch touch queues, or AppPageHeader inside the operator plane",
    exemplar:
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
    exports: [
      "BranchOperatorPage",
      "BranchOperatorPanel",
      "BranchOperatorPanelSkeleton",
      "BranchOperatorFrame",
      "BranchOperatorControlBar",
      "BranchOperatorControlBarSkeleton",
      "BranchOperatorActionBar",
      "BranchOperatorActionGrid",
      "BranchOperatorInlineState",
      "BranchOperatorStatusStrip",
      "BranchOperatorDetailList",
      "BranchOperatorActionSection",
    ],
  },
  employee: {
    source: "apps/web/lib/staff-runtime/components/staff-runtime-page.tsx",
    prefix: "Employee",
    need: "employee self-service runtime composition",
    fallback: "Branch operator adapter only when the workflow is branch-owned",
    forbidden:
      "AppShell, AppSection direct import, AppListFrame, DataTable, or route-local employee surface clones",
    exemplar: "clock, schedule, leave, payslip, and profile",
    exports: [
      "EmployeePage",
      "EmployeePanel",
      "EmployeeFrame",
      "EmployeeControlBar",
      "EmployeeActionBar",
      "EmployeeActionGrid",
      "EmployeeInlineState",
      "EmployeeStatusStrip",
      "EmployeeDetailList",
      "EmployeeActionSection",
      "EmployeeMissingProfileEmpty",
    ],
  },
};

function block(archetypes, planes, need, use, fallback, forbidden, exemplar) {
  return {
    source: "docs/spec/page-archetypes.md",
    archetypes,
    planes,
    need,
    use,
    fallback,
    forbidden,
    exemplar,
  };
}

export const UI_BLOCK_REGISTRY = {
  "management-list": block(
    ["LIST"],
    ["control_surface"],
    "search, filter, compare, and act on a management collection",
    "AppPage width=xwide density=compact + AppPageHeader + AppListFrame(toolbar=AppToolbar inline) + DataTable",
    "AppSection contentFlush for a section-scoped table without LIST toolbar",
    "raw Card/Table, InventoryListFrame alias, separate mobile and desktop trees, or inventing a *Block import",
    "apps/web/app/(protected)/inventory/grn/page.tsx",
  ),
  "management-detail": block(
    ["DETAIL"],
    ["control_surface"],
    "review one management entity and its stage actions",
    "AppPage + AppPageHeader + DescriptionList + DataTable + AppDetailFooter",
    "AppSection when the entity has no repeated lines",
    "KpiCard metadata or route-local detail chrome",
    "apps/web/app/(protected)/inventory/transfers/[id]/page.tsx",
  ),
  "management-document": block(
    ["DOC-WORKFLOW"],
    ["control_surface"],
    "create or edit a line-array business document",
    "DocumentFormFrame + shared form fields + DataTable line editor",
    "AppPage + AppDetailFooter for a short document",
    "hand-rolled document shell, parallel line trees, or inventing a *Block import",
    "apps/web/app/(protected)/inventory/transfers/new/page.tsx",
  ),
  "management-settings": block(
    ["SETTINGS-PANEL"],
    ["control_surface"],
    "edit tenant or module configuration",
    "SettingsPageFrame + shared form fields + FormDialog for list CRUD",
    "AppSection for read-only configuration",
    "route-local settings card or raw label-control anatomy",
    "apps/web/app/(protected)/settings/(tenant)/general/page.tsx",
  ),
  "management-landing": block(
    ["LANDING"],
    ["control_surface"],
    "enter a group of management capabilities",
    "AppPage + AppPageHeader + AppSection + LinkCardGrid",
    "ItemGroup for a compact action list",
    "dashboard-card mosaic or route-local navigation cards",
    "apps/web/app/(protected)/settings/page.tsx",
  ),
  "management-dashboard": block(
    ["DASHBOARD"],
    ["control_surface"],
    "scan decision metrics and open their owning workflows",
    "AppPage + AppPageHeader + KpiRow + actionable sections",
    "management-landing when no governed metric exists",
    "decorative metrics or cards without drill-down authority",
    "apps/web/app/(protected)/finance/page.tsx",
  ),
  "management-report": block(
    ["REPORT"],
    ["control_surface"],
    "filter, summarize, and inspect a management report",
    "AppPage + AppPageHeader + AppToolbar + KpiRow + chart or DataTable",
    "DataTable only when exact values are the primary job",
    "decorative charts or duplicated filter controls",
    "apps/web/app/(protected)/finance/revenue/page.tsx",
  ),
  "branch-action-home": block(
    ["LANDING", "DASHBOARD"],
    ["branch"],
    "surface the next safe branch action and live work",
    "BranchOperatorPage + primary action + live queue + curated action sections",
    "BranchOperatorActionSection for a simple job group",
    "AppShell, AppListFrame, DocumentFormFrame, DataTable, KPI mosaic, raw Card, or duplicated bottom-nav destinations",
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  ),
  "branch-touch-list": block(
    ["LIST"],
    ["branch"],
    "scan and act on a fixed-branch work queue",
    "BranchOperatorPage + BranchOperatorPanel/controls + ItemGroup full-row actions",
    "BranchOperatorInlineState / AppEmptyState when the queue is empty or blocked",
    "AppShell, AppListFrame, DocumentFormFrame, DataTable, desktop table at tablet width, control_surface LIST adapters, raw Card, or inventing a *Block import",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/page.tsx",
  ),
  "branch-touch-detail": block(
    ["DETAIL"],
    ["branch"],
    "review one branch entity and perform its next permitted action",
    "BranchOperatorPage + BranchOperatorPanel + ItemGroup + AppDetailFooter",
    "bottom Sheet for a focused edit or decision",
    "AppShell, AppListFrame, DocumentFormFrame, DataTable, control_surface detail presenter, audit chrome, raw Card, or multiple primary actions",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/page.tsx",
  ),
  "branch-touch-document": block(
    ["DOC-WORKFLOW"],
    ["branch"],
    "complete a line workflow on phone or tablet",
    "BranchOperatorPage + BranchOperatorPanel + WasteLineSheet + AppDetailFooter",
    "bottom Sheet for one line at a time",
    "AppShell, AppListFrame, DocumentFormFrame, DataTable, desktop side editor, or raw Card",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx",
  ),
  "realtime-board": block(
    ["BOARD"],
    ["station"],
    "operate a live kitchen queue from a dedicated station surface",
    "KDS station chrome + OperationalBoardCard + touch bump/recall controls",
    "PageSpinner / AppEmptyState while real queue data is unavailable",
    "AppSection, AppShell, AppListFrame, BranchOperatorPage, fake ticket skeleton, dashboard grid, raw Card, or hover-only action",
    "apps/web/app/(protected)/br/[branchId]/kds/page.tsx",
  ),
  "runner-board": block(
    ["BOARD"],
    ["station"],
    "call ready orders on a dedicated runner / pickup display",
    "Runner station chrome + touch-first order columns + AppEmptyState for idle/error",
    "PageSpinner while real queue data is unavailable",
    "AppSection, AppShell, AppListFrame, BranchOperatorPage, control_surface LIST adapters, raw Card, or dashboard grid",
    "apps/web/app/(protected)/br/[branchId]/pickup/page.tsx",
  ),
  "pos-board": block(
    ["BOARD"],
    ["station"],
    "take orders, build a cart, and complete checkout on a full-screen POS station",
    "PosDesktopShell + OperationalTile + StationSection/Frame sections + touch controls",
    "AppEmptyState for session gate or empty cart",
    "AppSection, AppShell, AppListFrame, BranchOperatorPage, control_surface LIST adapters, raw Card, or dashboard grid",
    "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx",
  ),
  "work-task-inbox": block(
    ["LIST"],
    ["control_surface"],
    "scan assigned work tasks with URL-backed status and search filters",
    "AppListFrame + AppToolbar inline + WorkInbox Item rows (WORK_LIST_ITEM_INSET)",
    "DataTable when exact column sort and export are required",
    "raw Card list, parallel mobile/desktop trees, or inventing a *Block import",
    "apps/web/app/(protected)/work/page.tsx",
  ),
  "work-task-board": block(
    ["TASK_BOARD"],
    ["control_surface"],
    "operate a department or project Kanban by work_tasks.status",
    "WorkComposeShell + AppBoardGrid + AppBoardColumn + AppBoardCard + AppBoardStatusDropdown + HTML5 drag to status RPC",
    "calendar or timeline compose for status changes",
    "packages/ui Calendar DayPicker, raw column Card grid, or inventing a *Block import",
    "apps/web/app/(protected)/work/_components/work-board.tsx",
  ),
  "work-task-calendar": block(
    ["TASK_CALENDAR"],
    ["control_surface"],
    "review due dates in a Vietnam month grid for mine or scoped tasks",
    "WorkComposeShell + WorkMonthGrid + WorkTaskChip (not ui/calendar DayPicker)",
    "BusinessDateField date picker for editing due_at on DETAIL",
    "ui/calendar.tsx DayPicker for task month view, hand-rolled grid strings, or inventing a *Block import",
    "apps/web/app/(protected)/work/_components/work-calendar.tsx",
  ),
  "employee-self-service": block(
    ["LANDING"],
    ["staff"],
    "complete personal shift, schedule, leave, payslip, and profile tasks",
    "EmployeePage + EmployeePanel/EmployeeActionSection + AppEmptyState",
    "BranchOperator* only when the same workflow is mounted under branch plane",
    "AppShell, AppSection direct import, AppListFrame, DataTable, or route-local employee clones",
    "apps/web/lib/staff-runtime/page.tsx",
  ),
  "public-transaction": block(
    ["PUBLIC-WORKFLOW"],
    ["public"],
    "complete a token-scoped customer transaction",
    "standalone AppPage + PublicSection/Item + shared form controls + one primary action",
    "AppEmptyState for invalid, expired, or unavailable context",
    "AppShell, AppSection, DataTable, AppListFrame, or loss of in-progress state on retry",
    "apps/web/app/q/[token]/page.tsx",
  ),
  "public-feedback": block(
    ["PUBLIC-WORKFLOW"],
    ["public"],
    "submit guest feedback from a token-scoped QR without app chrome",
    "standalone AppPage + Item + FeedbackForm",
    "AppEmptyState for invalid or expired token",
    "AppShell, AppSection, DataTable, AppListFrame, or runner station chrome",
    "apps/web/app/r/[token]/page.tsx",
  ),
  "system-gate": block(
    ["GATE/AUTH"],
    ["public", "system"],
    "resolve one pre-context, permission, offline, or terminal decision",
    "standalone AppPage + PublicSection/AppEmptyState + one forward action",
    "LinkCardGrid when the gate is a genuine destination picker",
    "AppShell, AppSection, or competing secondary navigation",
    "apps/web/app/(public)/access-denied/page.tsx",
  ),
};

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function normalizeComponentName(value) {
  return value
    .toLowerCase()
    .replace(/\.tsx$/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findComponentGuidance(query) {
  const normalizedQuery = normalizeComponentName(query.trim());
  if (!normalizedQuery) return [];

  const sharedComponents = Object.entries(SHARED_COMPONENT_REGISTRY)
    .filter(
      ([file]) =>
        normalizeComponentName(file.replace(/\.tsx$/, "")) === normalizedQuery,
    )
    .map(([file, entry]) => ({
      layer: "shared-component",
      name: file.replace(/\.tsx$/, ""),
      source: `packages/ui/src/components/${file}`,
      classification: entry.access,
      ...entry,
    }));

  const appAdapters = Object.entries(APP_ADAPTER_REGISTRY)
    .filter(([name]) => normalizeComponentName(name) === normalizedQuery)
    .map(([name, entry]) => ({
      layer: "app-adapter",
      name,
      classification: "adapter",
      ...entry,
    }));

  const domainAdapters = Object.entries(DOMAIN_ADAPTER_FAMILIES)
    .filter(
      ([family, entry]) =>
        normalizeComponentName(family) === normalizedQuery ||
        normalizeComponentName(entry.prefix) === normalizedQuery ||
        entry.exports.some(
          (name) => normalizeComponentName(name) === normalizedQuery,
        ),
    )
    .map(([family, entry]) => ({
      layer: "domain-adapter",
      name: family,
      source: entry.source,
      classification: "adapter-family",
      need: entry.need,
      use: entry.exports.join(", "),
      fallback: entry.fallback,
      forbidden: entry.forbidden,
      exemplar: entry.exemplar,
    }));

  const uiBlocks = Object.entries(UI_BLOCK_REGISTRY)
    .filter(([name]) => normalizeComponentName(name) === normalizedQuery)
    .map(([name, entry]) => ({
      layer: "ui-block",
      name,
      classification: "block",
      ...entry,
    }));

  return [...sharedComponents, ...appAdapters, ...domainAdapters, ...uiBlocks];
}

function validateDecisionEntry(label, entry, errors) {
  if (!VALID_ACCESS.has(entry.access) && entry.access != null) {
    errors.push(`${label} has unknown access ${entry.access}`);
  }
  for (const key of ["need", "use", "fallback", "forbidden", "exemplar"]) {
    if (typeof entry[key] !== "string" || entry[key].trim().length === 0) {
      errors.push(`${label} is missing ${key}`);
    }
  }
}

export function buildSharedComponentCoverage(actualComponentFiles) {
  const actual = uniqueSorted(actualComponentFiles);
  const registered = Object.keys(SHARED_COMPONENT_REGISTRY).sort();
  const actualSet = new Set(actual);
  const registeredSet = new Set(registered);
  const unclassified = actual.filter((file) => !registeredSet.has(file));
  const stale = registered.filter((file) => !actualSet.has(file));
  const errors = [];
  const accessCounts = {};

  for (const [file, entry] of Object.entries(SHARED_COMPONENT_REGISTRY)) {
    validateDecisionEntry(`shared component ${file}`, entry, errors);
    accessCounts[entry.access] = (accessCounts[entry.access] ?? 0) + 1;
  }
  if (unclassified.length > 0) {
    errors.push(
      `unclassified shared component files: ${unclassified.join(", ")}. Add a decision route before using or exporting the component.`,
    );
  }
  if (stale.length > 0) {
    errors.push(`stale shared component registry files: ${stale.join(", ")}`);
  }

  return {
    actual,
    registered,
    unclassified,
    stale,
    accessCounts,
    errors,
    total: actual.length,
  };
}

function exportedFunctions(source, prefix) {
  return uniqueSorted(
    [...source.matchAll(/export\s+function\s+([A-Za-z][A-Za-z0-9]*)/g)]
      .map((match) => match[1])
      .filter((name) => name.startsWith(prefix)),
  );
}

export function validateUiComponentRegistry(repoRoot) {
  const sharedComponentDir = path.join(repoRoot, "packages/ui/src/components");
  const actualSharedComponentFiles = fs
    .readdirSync(sharedComponentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name);
  const sharedComponentCoverage = buildSharedComponentCoverage(
    actualSharedComponentFiles,
  );
  const errors = [...sharedComponentCoverage.errors];

  for (const [name, entry] of Object.entries(APP_ADAPTER_REGISTRY)) {
    validateDecisionEntry(`app adapter ${name}`, entry, errors);
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      errors.push(`app adapter ${name} source is missing: ${entry.source}`);
      continue;
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    if (!new RegExp(`\\b${name}\\b`).test(source)) {
      errors.push(`app adapter ${name} is not present in ${entry.source}`);
    }
  }

  const liveArchetypes = new Set([
    ...Object.values(PAGE_ARCHETYPES),
    ...CONTROL_SURFACE_COMPOSE_SHAPES,
  ]);
  for (const [name, entry] of Object.entries(UI_BLOCK_REGISTRY)) {
    validateDecisionEntry(`UI block ${name}`, entry, errors);
    if (
      !Array.isArray(entry.archetypes) ||
      entry.archetypes.length === 0 ||
      entry.archetypes.some((archetype) => !liveArchetypes.has(archetype))
    ) {
      errors.push(`UI block ${name} has unknown or missing archetypes`);
    }
    if (
      !Array.isArray(entry.planes) ||
      entry.planes.length === 0 ||
      entry.planes.some((plane) => !VALID_BLOCK_PLANES.has(plane))
    ) {
      errors.push(`UI block ${name} has unknown or missing planes`);
    }
    if (!fs.existsSync(path.join(repoRoot, entry.source))) {
      errors.push(`UI block ${name} source is missing: ${entry.source}`);
    }
    if (!fs.existsSync(path.join(repoRoot, entry.exemplar))) {
      errors.push(`UI block ${name} exemplar is missing: ${entry.exemplar}`);
    }
  }

  let domainExportCount = 0;
  for (const [family, entry] of Object.entries(DOMAIN_ADAPTER_FAMILIES)) {
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      errors.push(
        `domain adapter family ${family} source is missing: ${entry.source}`,
      );
      continue;
    }
    for (const key of ["need", "fallback", "forbidden", "exemplar"]) {
      if (typeof entry[key] !== "string" || entry[key].trim().length === 0) {
        errors.push(`domain adapter family ${family} is missing ${key}`);
      }
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    const actualExports = exportedFunctions(source, entry.prefix);
    const registeredExports = uniqueSorted(entry.exports);
    domainExportCount += registeredExports.length;
    const actualSet = new Set(actualExports);
    const registeredSet = new Set(registeredExports);
    const missing = actualExports.filter((name) => !registeredSet.has(name));
    const stale = registeredExports.filter((name) => !actualSet.has(name));
    if (missing.length > 0) {
      errors.push(
        `domain adapter family ${family} has unclassified exports: ${missing.join(", ")}`,
      );
    }
    if (stale.length > 0) {
      errors.push(
        `domain adapter family ${family} has stale exports: ${stale.join(", ")}`,
      );
    }
  }

  return {
    sharedComponentCoverage,
    appAdapterCount: Object.keys(APP_ADAPTER_REGISTRY).length,
    auditAdapterNames: Object.entries(APP_ADAPTER_REGISTRY)
      .filter(([, entry]) => entry.audit)
      .map(([name]) => name),
    domainFamilyCount: Object.keys(DOMAIN_ADAPTER_FAMILIES).length,
    domainExportCount,
    uiBlockCount: Object.keys(UI_BLOCK_REGISTRY).length,
    errors,
  };
}

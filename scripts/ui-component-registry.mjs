import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const VALID_ACCESS = new Set([
  "direct",
  "adapter-only",
  "workflow-only",
  "internal",
]);

function decision(access, need, use, fallback, forbidden, exemplar) {
  return { access, need, use, fallback, forbidden, exemplar };
}

const direct = (...args) => decision("direct", ...args);
const adapterOnly = (...args) => decision("adapter-only", ...args);
const workflowOnly = (...args) => decision("workflow-only", ...args);
const internal = (...args) => decision("internal", ...args);

export const SHARED_COMPONENT_REGISTRY = {
  "accordion.tsx": direct(
    "multi-panel disclosure",
    "Accordion",
    "Collapsible for one disclosure",
    "route-local disclosure markup and chevron state",
    "grouped settings sections",
  ),
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
    "Link rendered through Button asChild for navigation commands",
    "raw button or route-local height patch",
    "all app command surfaces",
  ),
  "calendar.tsx": adapterOnly(
    "calendar selection internals",
    "DatePicker or BusinessDateField",
    "native date input only where the contract explicitly permits it",
    "route-authored Calendar popover",
    "business-date form fields",
  ),
  "card.tsx": adapterOnly(
    "surface framing internals",
    "AppSection, AppLinkCard, KpiCard, InteractiveCard, or OperationalBoardCard",
    "document or item composition when no card role applies",
    "raw Card import in route code without a documented role",
    "approved app surface adapters",
  ),
  "chart.tsx": workflowOnly(
    "report visualization",
    "ChartContainer and chart helpers inside a report contract",
    "DataTable when exact values are the primary job",
    "decorative dashboard chart without an operational metric contract",
    "finance and inventory reports",
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
    "route-local Command plus Popover assembly",
    "shared form combobox adapters",
  ),
  "command.tsx": adapterOnly(
    "command palette internals",
    "Combobox, MultiSelectCombobox, or an approved command surface",
    "Select for a small option set",
    "route-local searchable picker assembly",
    "shared selection adapters",
  ),
  "confirm-dialog.tsx": workflowOnly(
    "simple yes or no confirmation",
    "confirm() with ConfirmDialogProvider mounted once",
    "ReasonConfirmDialog when a reason is required",
    "window.confirm or route-local AlertDialog",
    "delete, void, and irreversible command confirmation",
  ),
  "context-menu.tsx": workflowOnly(
    "advanced row action opened by right click or long press",
    "ContextMenu",
    "RowActionsMenu for visible click actions",
    "using context menu as the only path to a required action",
    "advanced data-row actions",
  ),
  "date-picker.tsx": adapterOnly(
    "date selection",
    "BusinessDateField or DatePicker through the form layer",
    "Calendar only inside an approved date adapter",
    "route-local calendar and formatting logic",
    "business-date forms",
  ),
  "dialog.tsx": adapterOnly(
    "modal overlay internals",
    "AppDialog, FormDialog, or FileImportDialog",
    "Sheet or Page for long multi-step work",
    "raw Dialog composition in route code",
    "shared app dialog adapters",
  ),
  "drawer.tsx": workflowOnly(
    "mobile-first contextual task overlay",
    "Drawer for a short touch workflow",
    "Sheet or Page when content is long or desktop-primary",
    "drawer used as decorative page framing",
    "compact operator task flows",
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
    "InputGroup",
    "Field plus Input for a plain field",
    "absolute-positioned addon inside a raw div",
    "search and unit-aware inputs",
  ),
  "input.tsx": direct(
    "single-line text or numeric control",
    "Input inside Field or a shared form wrapper",
    "FormattedNumberInput for localized numeric entry",
    "unstyled native input or route-local control height",
    "simple form controls",
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
  "pagination.tsx": workflowOnly(
    "page navigation",
    "DataTable pagination or Pagination",
    "load-more action for an incremental feed",
    "custom page-number button row",
    "large list navigation",
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
  "reason-confirm-dialog.tsx": workflowOnly(
    "confirmation requiring a reason",
    "ReasonConfirmDialog",
    "FormDialog for multiple structured fields",
    "prompt, window.confirm, or route-local reason modal",
    "reject, cancel, and adjustment reason flows",
  ),
  "resizable.tsx": workflowOnly(
    "desktop split-pane resizing",
    "Resizable inside a desktop workspace contract",
    "responsive stacked layout on touch surfaces",
    "resizable controls in frontline mobile workflows",
    "dense management workspaces",
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
  "sheet.tsx": workflowOnly(
    "edge-mounted contextual task",
    "Sheet",
    "Page for long document work or Drawer for touch-first short work",
    "sheet as permanent page chrome",
    "detail and editing side panels",
  ),
  "sidebar.tsx": adapterOnly(
    "management navigation chrome internals",
    "AppShell or OfficeModuleShell",
    "AppBottomNav for operator navigation",
    "route-local SidebarProvider or third shell",
    "management shell",
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
  "slot.tsx": internal(
    "primitive composition plumbing",
    "Slot inside shared primitives",
    "asChild APIs exposed by approved components",
    "route code importing Slot to manufacture a primitive",
    "shared primitive implementations",
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
  "switch.tsx": direct(
    "immediate binary setting",
    "Switch inside Field",
    "Checkbox when submission is deferred or selection is additive",
    "button with custom on and off visuals",
    "settings toggles",
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
    "Tabs or AppPageTabs",
    "URL navigation when views are separate routes",
    "duplicate chips and tabs for the same facet",
    "page subviews and POS modes",
  ),
  "tag-input.tsx": direct(
    "multiple free-form tokens",
    "TagInput",
    "MultiSelectCombobox for a controlled option set",
    "comma-delimited plain text without token feedback",
    "labels and aliases",
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
    "apps/web/app/components/surface.tsx",
    "page container",
    "AppPage",
    "fullscreen route contract",
    "route-local width and padding wrapper",
    "management content page",
    true,
  ),
  AppPageHeader: adapter(
    "apps/web/app/components/surface.tsx",
    "page heading",
    "AppPageHeader",
    "operator-owned chrome",
    "hand-rolled page H1",
    "management page header",
    true,
  ),
  AppBackLink: adapter(
    "apps/web/app/components/surface.tsx",
    "back navigation affordance",
    "AppBackLink",
    "Button asChild ghost icon Link for a combined back-plus-title row",
    "route-local ArrowLeft anchor with duplicated classes",
    "AppPageHeader breadcrumb slot",
  ),
  AppShellPaddingBoundary: adapter(
    "apps/web/app/components/surface.tsx",
    "shell padding ownership",
    "AppShellPaddingBoundary",
    "AppPage owns padding when no shell does",
    "nested padding compensation",
    "AppShell main region",
  ),
  AppSection: adapter(
    "apps/web/app/components/surface.tsx",
    "content section",
    "AppSection",
    "Item for a compact row",
    "raw bordered card section",
    "detail and form sections",
    true,
  ),
  AppToolbar: adapter(
    "apps/web/app/components/surface.tsx",
    "filter and command toolbar",
    "AppToolbar",
    "DataTable toolbar slots",
    "route-local toolbar chrome",
    "list filters",
    true,
  ),
  DocumentFormFrame: adapter(
    "apps/web/app/components/surface.tsx",
    "document line workflow",
    "DocumentFormFrame",
    "AppPage plus AppDetailFooter",
    "hand-rolled document shell",
    "GRN and purchase order forms",
  ),
  OperationalTile: adapter(
    "apps/web/app/components/surface.tsx",
    "large selectable action",
    "OperationalTile",
    "Button size=tile",
    "clickable div tile",
    "POS context selection",
  ),
  OperationalBoardCard: adapter(
    "apps/web/app/components/surface.tsx",
    "operational board item",
    "OperationalBoardCard",
    "Item for a compact row",
    "generic dashboard card",
    "POS and KDS boards",
  ),
  AppEmptyState: adapter(
    "apps/web/app/components/surface.tsx",
    "empty or panel error state",
    "AppEmptyState",
    "TableEmptyStateRow inside a table",
    "route-local empty block",
    "list and detail empty states",
    true,
  ),
  AppLinkCard: adapter(
    "apps/web/app/components/surface.tsx",
    "navigation card",
    "AppLinkCard",
    "Item asChild for a compact link",
    "raw clickable card",
    "management hubs",
    true,
  ),
  LinkCardGrid: adapter(
    "apps/web/app/components/surface.tsx",
    "navigation card grid",
    "LinkCardGrid",
    "ItemGroup for row actions",
    "route-local responsive card grid",
    "management hubs",
  ),
  KpiRow: adapter(
    "apps/web/app/components/surface.tsx",
    "metric row layout",
    "KpiRow",
    "DescriptionList for non-metrics",
    "generic card grid for values",
    "finance overview",
  ),
  DescriptionList: adapter(
    "apps/web/app/components/surface.tsx",
    "term and value detail",
    "DescriptionList",
    "DataTable for repeated records",
    "KPI cards for metadata",
    "record detail",
  ),
  AppDetailFooter: adapter(
    "apps/web/app/components/surface.tsx",
    "detail action footer",
    "AppDetailFooter",
    "normal flow actions for short pages",
    "fixed footer with local offsets",
    "document detail",
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
  InteractiveCard: adapter(
    "apps/web/app/components/data-table/interactive-card.tsx",
    "mobile data-row card",
    "InteractiveCard through DataTable mobileCardRender",
    "Item for non-tabular content",
    "custom clickable card row",
    "responsive DataTable rows",
  ),
  AppDialog: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "detail or short task modal",
    "AppDialog",
    "Sheet or Page for long work",
    "raw Dialog composition",
    "record detail task",
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
  ReasonConfirmDialog: adapter(
    "packages/ui/src/components/reason-confirm-dialog.tsx",
    "confirmation with a required reason",
    "ReasonConfirmDialog",
    "FormDialog for multiple structured fields",
    "route-local reason modal",
    "reject and cancellation flows",
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
  FileImportDialog: adapter(
    "apps/web/app/components/form/form-dialog.tsx",
    "file import workflow",
    "FileImportDialog",
    "Page for a complex import review",
    "route-local upload dialog",
    "CSV import",
    true,
  ),
  TextField: adapter(
    "apps/web/app/components/form/text-field.tsx",
    "text form field",
    "TextField",
    "Field plus Input for special composition",
    "raw label and input spacing",
    "standard forms",
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
    "DatePicker for non-form composition",
    "route-local date formatting",
    "finance and inventory forms",
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
    "route-local Command and Popover",
    "supplier and ingredient selection",
  ),
  MultiSelectCombobox: adapter(
    "apps/web/app/components/form/multi-select-combobox.tsx",
    "searchable multi-selection",
    "MultiSelectCombobox",
    "TagInput for free-form values",
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
    "KDS and runner loading",
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
    "admin settings",
    true,
  ),
  AppPageTabs: adapter(
    "apps/web/app/components/app-page-tabs.tsx",
    "page-level segmented views",
    "AppPageTabs",
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
    forbidden: "Management shell or AppPageHeader inside the operator plane",
    exemplar: "branch stock, orders, and team workflows",
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
      "BranchOperatorBadgeList",
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
    forbidden: "Management shell or route-local employee surface clones",
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

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function hasNamedExport(source, name) {
  const sourceFile = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      if (
        statement.exportClause.elements.some(
          (element) => !element.isTypeOnly && element.name.text === name,
        )
      ) {
        return true;
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? [])
      : [];
    const isNamedRuntimeExport =
      modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      !modifiers.some(
        (modifier) =>
          modifier.kind === ts.SyntaxKind.DefaultKeyword ||
          modifier.kind === ts.SyntaxKind.DeclareKeyword,
      );
    if (!isNamedRuntimeExport) continue;

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return true;
    }

    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === name,
      )
    ) {
      return true;
    }
  }

  return false;
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
  const componentDir = path.join(repoRoot, "packages/ui/src/components");
  const actualComponentFiles = fs
    .readdirSync(componentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name);
  const sharedComponentCoverage =
    buildSharedComponentCoverage(actualComponentFiles);
  const errors = [...sharedComponentCoverage.errors];

  for (const [name, entry] of Object.entries(APP_ADAPTER_REGISTRY)) {
    validateDecisionEntry(`app adapter ${name}`, entry, errors);
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      errors.push(`app adapter ${name} source is missing: ${entry.source}`);
      continue;
    }
    const source = fs.readFileSync(sourcePath, "utf8");
    if (!hasNamedExport(source, name)) {
      errors.push(`app adapter ${name} is not exported by ${entry.source}`);
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
    errors,
  };
}

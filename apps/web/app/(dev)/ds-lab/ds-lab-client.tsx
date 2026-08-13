"use client";

import { useState } from "react";
import { CircleAlert as IconCircleAlert } from "lucide-react";

import { cn } from "@comtammatu/ui";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import {
  Avatar,
  AvatarFallback,
} from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Progress } from "@comtammatu/ui/components/progress";
import { RadioGroup, RadioGroupItem } from "@comtammatu/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Separator } from "@comtammatu/ui/components/separator";

import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Slider } from "@comtammatu/ui/components/slider";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";

import { AppDialog } from "@/components/form/form-dialog";
import {
  AppDetailFooter,
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
  PublicSection,
  StationSection,
  AppSheet,
} from "@/components/surface";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  WORK_KANBAN_COLUMN,
  WORK_LIST_ITEM_INSET,
  WORK_MONTH_CELL,
  WORK_TASK_CHIP,
  WORK_TIMELINE_ROW,
} from "../../(protected)/work/_lib/compose-styles";
import { Frame } from "@comtammatu/ui/components/frame";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { EmployeePanel } from "@lib/staff-runtime/components/staff-runtime-page";

const SURFACE_TOKENS = [
  { name: "background", swatch: "bg-background" },
  { name: "card", swatch: "bg-card" },
  { name: "popover", swatch: "bg-popover" },
  { name: "muted", swatch: "bg-muted" },
  { name: "accent", swatch: "bg-accent" },
  { name: "sidebar", swatch: "bg-sidebar" },
] as const;

const ACTION_TOKENS = [
  { name: "primary", swatch: "bg-primary" },
  { name: "secondary", swatch: "bg-secondary" },
  { name: "destructive", swatch: "bg-destructive" },
  { name: "success", swatch: "bg-success" },
  { name: "warning", swatch: "bg-warning" },
  { name: "info", swatch: "bg-info" },
] as const;

const FG_ROLES = [
  { name: "foreground", className: "text-foreground" },
  { name: "muted-foreground", className: "text-muted-foreground" },
  { name: "primary", className: "text-primary" },
  { name: "destructive", className: "text-destructive" },
  { name: "success", className: "text-success" },
  { name: "warning", className: "text-warning" },
] as const;

const TYPE_SCALE = [
  { name: "text-3xs", className: "text-3xs" },
  { name: "text-2xs", className: "text-2xs" },
  { name: "text-xs", className: "text-xs" },
  { name: "text-sm", className: "text-sm" },
  { name: "text-base", className: "text-base" },
  { name: "text-lg", className: "text-lg" },
  { name: "text-xl", className: "text-xl" },
  { name: "text-2xl", className: "text-2xl" },
] as const;

const SPACING_SCALE = [
  { name: "1", className: "w-1" },
  { name: "2", className: "w-2" },
  { name: "3", className: "w-3" },
  { name: "4", className: "w-4" },
  { name: "6", className: "w-6" },
  { name: "8", className: "w-8" },
  { name: "12", className: "w-12" },
  { name: "16", className: "w-16" },
] as const;

const RADIUS_SCALE = [
  { name: "rounded-sm", className: "rounded-sm" },
  { name: "rounded-md", className: "rounded-md" },
  { name: "rounded-lg", className: "rounded-lg" },
  { name: "rounded-xl", className: "rounded-xl" },
  { name: "rounded-full", className: "rounded-full" },
] as const;

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const BADGE_TONES = [
  "default",
  "secondary",
  "outline",
  "success",
  "warning",
  "info",
  "destructive",
] as const;

const LIST_ROWS = [
  { code: "SP-001", name: "Grilled pork rice", qty: "120", tone: "success" },
  { code: "SP-014", name: "Shredded pork rice", qty: "84", tone: "info" },
  { code: "SP-027", name: "Bitter melon soup", qty: "12", tone: "warning" },
] as const;

const ITEM_SIZES = ["default", "sm", "xs"] as const;

/** Matches DataTable mobile Item stack — Dual Thesis Item-row inset. */
const LIST_ITEM_INSET = "gap-2 px-3 py-3";

const MOTION_TOKENS = [
  { name: "--motion-fast", value: "120ms" },
  { name: "--motion-base", value: "150ms" },
  { name: "--motion-overlay", value: "200ms" },
  { name: "--motion-drawer", value: "240ms" },
  { name: "--motion-progress", value: "300ms" },
  { name: "--motion-spinner", value: "700ms" },
  { name: "--ease-move", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
] as const;

const UX_PERSONA_ROWS = [
  {
    persona: "Chủ tiệm",
    job: "Giám sát L0 (tài chính, nhân sự, kho, thực đơn)",
    plane: "control_surface",
  },
  {
    persona: "Kế toán",
    job: "Finance slice (+ /me khi không gắn CN)",
    plane: "control_surface",
  },
  {
    persona: "Kho Tổng / Bếp TT",
    job: "Inventory L0 + stock site",
    plane: "control_surface + branch_surface",
  },
  {
    persona: "Quản lý CN",
    job: "Ca, đội, kho CN, ngoại lệ ngày",
    plane: "branch_surface",
  },
  {
    persona: "Thu ngân / Bếp / Runner",
    job: "Bán · bump · served",
    plane: "station_chrome",
  },
  {
    persona: "NV ngoài Branch",
    job: "Clock / lịch / phép / payslip",
    plane: "staff (/me)",
  },
  {
    persona: "Khách / đăng nhập",
    job: "Tự đặt món, HĐĐT, đăng nhập",
    plane: "public",
  },
] as const;

const UX_FAMILY_RECIPES = [
  {
    family: "Station POS",
    entry: "Mở ca đầu phiên",
    success: "Cart → pay / bump",
    recovery: "Recall / retry khi lỡ",
    density: "Board full-screen; hide giá trên KDS/Runner",
    exemplar: "apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx",
  },
  {
    family: "Branch operator",
    entry: "/br/[id] hub → tab/workflow",
    success: "Duyệt / hoàn thành việc ca",
    recovery: "Quay lại tuyến sở hữu",
    density: "Touch comfortable; no DataTable on phone queues",
    exemplar:
      "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  },
  {
    family: "control_surface LIST",
    entry: "Danh sách đúng plane",
    success: "Mở record / chốt phiếu",
    recovery: "Retry / confirm; empty + filter reset",
    density: "compact + xwide; AppListFrame → DataTable",
    exemplar:
      "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  },
] as const;

function Swatch({ name, swatch }: { name: string; swatch: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("h-10 w-full rounded-sm border border-border", swatch)} />
      <span className="font-mono text-3xs text-muted-foreground">{name}</span>
    </div>
  );
}

function Caption({ children }: { children: string }) {
  return <p className="text-2xs text-muted-foreground">{children}</p>;
}

export function DesignLabClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [enterDemoKey, setEnterDemoKey] = useState(0);
  const [sliderValue, setSliderValue] = useState(40);
  const [selectValue, setSelectValue] = useState("central");

  return (
    <AppPage as="main" width="wide" scroll>
      <div className="flex flex-col gap-4">
        <AppPageHeader
          eyebrow="Internal"
          title="Design System Lab"
          description="Dev-only Má Tư DS lab: tokens, primitives, Item, LIST chrome, plane recipes, UX spine, and motion. Toggle theme for light vs night."
          badge={{ children: "dev only", variant: "warning" }}
          actions={<ThemeToggle variant="outline" size="icon" />}
        />

        <AppSection
          title="1 · Tokens"
          headingLevel="h2"
          description="Semantic surfaces, status fills, and foreground roles. Every token below is defined twice in globals.css — once for light, once for .dark."
        >
          <div className="flex flex-col gap-3">
            <Caption>Surfaces · bg-*</Caption>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {SURFACE_TOKENS.map((token) => (
                <Swatch key={token.name} {...token} />
              ))}
            </div>
            <Caption>Status / action fills · bg-*</Caption>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ACTION_TOKENS.map((token) => (
                <Swatch key={token.name} {...token} />
              ))}
            </div>
            <Caption>Foreground roles · text-*</Caption>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FG_ROLES.map((role) => (
                <Item key={role.name} size="xs" variant="outline">
                  <ItemContent>
                    <ItemTitle className={role.className}>{role.name}</ItemTitle>
                  </ItemContent>
                </Item>
              ))}
            </div>
          </div>
        </AppSection>

        <AppSection
          title="2 · Typography"
          headingLevel="h2"
          description="Named scale only — arbitrary text-[…] sizes fail the UI contract. font-heading / font-mono are the display and tabular roles."
        >
          <div className="flex flex-col gap-2">
            {TYPE_SCALE.map((step) => (
              <div key={step.name} className="flex items-baseline gap-3">
                <span className="w-24 shrink-0 font-mono text-3xs text-muted-foreground">
                  {step.name}
                </span>
                <span className={step.className}>
                  The quick brown fox · 1234567890
                </span>
              </div>
            ))}
            <div className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-mono text-3xs text-muted-foreground">
                font-heading
              </span>
              <span className="font-heading text-xl">The quick brown fox</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-mono text-3xs text-muted-foreground">
                font-mono
              </span>
              <span className="font-mono text-sm tabular-nums">1.250.000 ₫</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-mono text-3xs text-muted-foreground">
                caption
              </span>
              <span className="text-2xs text-muted-foreground">
                Secondary caption / hint copy
              </span>
            </div>
          </div>
        </AppSection>

        <AppSection
          title="3 · Spacing & radius"
          headingLevel="h2"
          description="Spacing bars use the Tailwind step scale; radius tiers map to the --radius token family."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              {SPACING_SCALE.map((step) => (
                <div key={step.name} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 font-mono text-3xs text-muted-foreground">
                    {step.name}
                  </span>
                  <div className={cn("h-2 rounded-sm bg-primary", step.className)} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {RADIUS_SCALE.map((tier) => (
                <div key={tier.name} className="flex flex-col gap-1">
                  <div className={cn("h-12 w-16 bg-muted", tier.className)} />
                  <span className="font-mono text-3xs text-muted-foreground">
                    {tier.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </AppSection>

        <AppSection
          title="4 · Primitives · controls"
          headingLevel="h2"
          description="Button, Field, Input, Select, Checkbox, Switch, Radio, Textarea, Slider — Base UI via @comtammatu/ui."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button size="default">default</Button>
              <Button size="lg">lg</Button>
              <Button size="field">field</Button>
              <Button size="touch">touch</Button>
              <Button disabled>disabled</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ds-lab-input-default">Input · default</FieldLabel>
                <Input id="ds-lab-input-default" placeholder="h-7" />
                <FieldDescription>Default control height.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ds-lab-input-field">Input · field</FieldLabel>
                <Input
                  id="ds-lab-input-field"
                  controlSize="field"
                  placeholder="h-10"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ds-lab-input-touch">Input · touch</FieldLabel>
                <Input
                  id="ds-lab-input-touch"
                  controlSize="touch"
                  placeholder="min-h-12"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ds-lab-select">Select</FieldLabel>
                <Select value={selectValue} onValueChange={setSelectValue}>
                  <SelectTrigger id="ds-lab-select" size="field" className="w-full">
                    <SelectValue placeholder="Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="central">Central warehouse</SelectItem>
                    <SelectItem value="branch">Branch store</SelectItem>
                    <SelectItem value="cold">Cold storage</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="ds-lab-textarea">Textarea</FieldLabel>
                <Textarea
                  id="ds-lab-textarea"
                  placeholder="Notes…"
                  defaultValue=""
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox id="ds-lab-check" defaultChecked />
                <Label htmlFor="ds-lab-check">Checkbox</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ds-lab-switch" defaultChecked />
                <Label htmlFor="ds-lab-switch">Switch</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ds-lab-check-disabled" disabled />
                <Label htmlFor="ds-lab-check-disabled">Disabled</Label>
              </div>
            </div>

            <Field>
              <FieldLabel>Radio group</FieldLabel>
              <RadioGroup defaultValue="a" className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="a" id="ds-lab-radio-a" />
                  <Label htmlFor="ds-lab-radio-a">Option A</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="b" id="ds-lab-radio-b" />
                  <Label htmlFor="ds-lab-radio-b">Option B</Label>
                </div>
              </RadioGroup>
            </Field>

            <div className="max-w-xs">
              <Slider
                label="Slider · Base UI"
                description="Keyboard: arrows step, Home/End jump."
                value={sliderValue}
                onValueChange={setSliderValue}
                formatValue={(value) => `${value} pt`}
              />
            </div>
          </div>
        </AppSection>

        <AppSection
          title="5 · Primitives · chrome"
          headingLevel="h2"
          description="Badge, Avatar, Tabs, Separator, Skeleton, Alert, and focus-ring sample."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {BADGE_TONES.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Avatar size="sm">
                <AvatarFallback>SM</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>DF</AvatarFallback>
              </Avatar>
              <Avatar size="lg">
                <AvatarFallback>LG</AvatarFallback>
              </Avatar>
            </div>

            <Tabs defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">Tab one</TabsTrigger>
                <TabsTrigger value="two">Tab two</TabsTrigger>
                <TabsTrigger value="three" disabled>
                  Disabled
                </TabsTrigger>
              </TabsList>
              <TabsContent value="one">
                <Caption>TabsContent · panel one</Caption>
              </TabsContent>
              <TabsContent value="two">
                <Caption>TabsContent · panel two</Caption>
              </TabsContent>
            </Tabs>

            <Separator />

            <div className="flex flex-col gap-2">
              <Caption>Skeleton · loading</Caption>
              <div aria-busy="true" className="flex flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>

            <Alert>
              <IconCircleAlert />
              <AlertTitle>Default alert</AlertTitle>
              <AlertDescription>
                Informational callout using the default alert variant.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <IconCircleAlert />
              <AlertTitle>Destructive alert</AlertTitle>
              <AlertDescription>
                Error / destructive state — same status vocabulary as Badge.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Caption>Focus ring · Tab to the button (focus-visible:ring)</Caption>
              <Button variant="outline" className="w-fit">
                Focus me
              </Button>
            </div>
          </div>
        </AppSection>

        <AppSection
          title="6 · Overlays"
          headingLevel="h2"
          description="Both overlays use Base UI data-[starting-style] / data-[ending-style] with CSS opacity/transform transitions (not one-frame animate-in keyframes)."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
          </div>

          <AppDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title="Dialog"
            description="AppDialog wraps the Base UI Dialog with the shared header, body and footer chrome."
            footer={
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
            }
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-lab-dialog-input">Field inside a dialog</Label>
              <Input id="ds-lab-dialog-input" controlSize="field" />
            </div>
          </AppDialog>

          <AppSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Sheet"
            description="Side panel with safe-area padding and slide enter/exit."
            footer={
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                Close
              </Button>
            }
          />
        </AppSection>

        <AppSection
          title="7 · Item system"
          headingLevel="h2"
          description="Item sizes side-by-side, outline vs default, with actions. Rendered inside normal AppSection padding (px-4)."
        >
          <div className="flex flex-col gap-4">
            <Caption>
              Item xs has px-2 py-2; flush is a LIST chrome concern shown in
              section 8.
            </Caption>
            <div className="grid gap-3 lg:grid-cols-3">
              {ITEM_SIZES.map((size) => (
                <div key={size} className="flex flex-col gap-2">
                  <span className="font-mono text-3xs text-muted-foreground">
                    size={size}
                  </span>
                  <Item size={size} variant="outline">
                    <ItemContent>
                      <ItemTitle>Outline · {size}</ItemTitle>
                      <ItemDescription>Border visible</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button size="xs" variant="ghost">
                        Go
                      </Button>
                    </ItemActions>
                  </Item>
                  <Item size={size} variant="default">
                    <ItemContent>
                      <ItemTitle>Default · {size}</ItemTitle>
                      <ItemDescription>No border</ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
              ))}
            </div>

            <Caption>Dense operational rows · size xs + actions</Caption>
            <ItemGroup>
              {LIST_ROWS.map((row) => (
                <Item key={row.code} size="xs" variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {row.code}
                      </span>
                      <span>{row.name}</span>
                    </ItemTitle>
                    <ItemDescription>Central warehouse · synced today</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={row.tone}>{row.qty}</Badge>
                    <Button size="xs" variant="ghost">
                      Detail
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </div>
        </AppSection>

        <AppSection
          title="8 · Layout Frame · LIST chrome"
          headingLevel="h2"
          description="AppListFrame + AppToolbar. Frame law: Frame = inset only; AppListFrame is the legal LIST adapter."
        >
          <div className="flex flex-col gap-4">
            <Caption>
              Dual Thesis: table/grid stays edge-flush under the toolbar;
              Item-row LIST uses px-3 py-3 + gap-2 (same as DataTable mobile).
              AppListFrame keeps contentFlush for the card chrome — Item bodies
              own the inset.
            </Caption>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                control_surface · AppListFrame + AppToolbar inline
              </span>
              <AppListFrame
                toolbar={
                  <AppToolbar
                    variant="inline"
                    search={
                      <InputGroup className="max-w-xs">
                        <InputGroupInput
                          placeholder="Search…"
                          aria-label="Lab list search"
                        />
                      </InputGroup>
                    }
                    actions={
                      <Button size="field" variant="outline">
                        Filter
                      </Button>
                    }
                  />
                }
              >
                <ItemGroup className={LIST_ITEM_INSET}>
                  {LIST_ROWS.slice(0, 2).map((row) => (
                    <Item key={`list-${row.code}`} size="xs" variant="outline">
                      <ItemContent>
                        <ItemTitle>
                          <span className="font-mono text-2xs text-muted-foreground">
                            {row.code}
                          </span>
                          <span>{row.name}</span>
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <Badge variant={row.tone}>{row.qty}</Badge>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </AppListFrame>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AppToolbar sticky · sibling filter chrome
              </span>
              <AppToolbar
                variant="inline"
                sticky
                search={
                  <InputGroup className="max-w-xs">
                    <InputGroupInput
                      placeholder="Sticky search…"
                      aria-label="Lab sticky search"
                    />
                  </InputGroup>
                }
                actions={
                  <Button size="sm" variant="outline">
                    Reset
                  </Button>
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AppEmptyState
              </span>
              <AppEmptyState
                mode="no-data"
                description="Canonical empty recipe for LIST / DETAIL when there is nothing to show."
                compact
              >
                <Button size="sm">Primary empty CTA</Button>
              </AppEmptyState>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AppDetailFooter
              </span>
              <AppDetailFooter
                leading={
                  <span className="text-sm text-muted-foreground">
                    Leading meta
                  </span>
                }
                trailing={
                  <>
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                    <Button size="sm">Save</Button>
                  </>
                }
              />
            </div>
          </div>
        </AppSection>

        <AppSection
          title="9 · Layout Frame · plane recipes"
          headingLevel="h2"
          description="Composition ladder: Shell (note only) → AppPage + AppPageHeader → plane-correct section. See design-system.md § Layout UI/UX Frame."
        >
          <div className="flex flex-col gap-4">
            <Caption>
              Shell chrome: control_surface mounts AppShell
              (apps/web/app/components/app-shell.tsx) — not mounted here (heavy).
              Branch / station / public / staff each use their approved chrome
              family.
            </Caption>

            <div className="grid gap-3 sm:grid-cols-2">
              <AppSection
                title="control_surface · AppSection"
                headingLevel="h3"
                description="Management card region on Owner routes."
                size="sm"
              >
                <p className="text-sm text-muted-foreground">
                  Default section for L0 control_surface pages.
                </p>
              </AppSection>
              <BranchOperatorPanel
                title="branch · BranchOperatorPanel"
                headingLevel="h3"
                description="Touch-first branch operator panel — not AppSection on branch queues."
                size="sm"
              >
                <p className="text-sm text-muted-foreground">
                  Branch action home / touch LIST / DETAIL / DOC.
                </p>
              </BranchOperatorPanel>
              <StationSection
                title="station_chrome · StationSection"
                headingLevel="h3"
                description="POS/KDS/Runner card region — never AppSection on station routes."
              >
                <p className="text-sm text-muted-foreground">
                  Board tickets and gates compose StationSection + Frame /
                  OperationalBoardCard.
                </p>
              </StationSection>
              <PublicSection
                title="public · PublicSection"
                headingLevel="h3"
                description="Guest / system-gate card region — AppPage stays chrome-less."
              >
                <p className="text-sm text-muted-foreground">
                  Login, access-denied, and token workflows use PublicSection for
                  framed sections.
                </p>
              </PublicSection>
              <EmployeePanel
                title="staff · EmployeePanel"
                description="Narrow staff self-service panel — EmployeePage owns page rhythm."
                size="sm"
              >
                <p className="text-sm text-muted-foreground">
                  Clock, schedule, payslip, profile recipes.
                </p>
              </EmployeePanel>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <AppSection
                title="density · comfortable"
                headingLevel="h3"
                description="Default AppPage / Card — branch, public, and staff stay touch-scannable."
              >
                <div className="flex flex-wrap gap-2">
                  <Button size="touch">Touch CTA</Button>
                  <Button size="default" variant="outline">
                    Default
                  </Button>
                </div>
              </AppSection>
              <AppSection
                title="density · compact"
                headingLevel="h3"
                description="AppPage density=compact + Card sm densifies control_surface without forking tokens."
                size="sm"
              >
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm">Dense CTA</Button>
                  <Button size="xs" variant="outline">
                    xs
                  </Button>
                </div>
              </AppSection>
            </div>
          </div>
        </AppSection>

        <AppSection
          title="10 · UX · screen recipes"
          headingLevel="h2"
          description="Trục UX sản phẩm: vai trò, việc cần làm, mặt phẳng; rồi lối vào, kết quả, lối lùi. Nguồn: screen-context-map §1A, Layout UI/UX Frame, Decision Ladder."
        >
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: dev-only design lab annotation, never shipped to product surfaces */}
            <Caption>
              Không bịa nghiên cứu. Khóa nhóm tuyến trước khi chọn kiểu trang và
              khối. Thang quyết định: mặt phẳng, kiểu trang, khối, ghép, kiểm
              chứng.
            </Caption>

            <ItemGroup className="gap-2">
              {UX_PERSONA_ROWS.map((row) => (
                <Item key={row.persona} size="xs" variant="outline">
                  <ItemContent className="gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <ItemTitle className="shrink-0">{row.persona}</ItemTitle>
                    <ItemDescription className="min-w-0 flex-1">
                      {row.job}
                    </ItemDescription>
                    <span className="shrink-0 font-mono text-3xs text-muted-foreground">
                      {row.plane}
                    </span>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Entry → success → recovery · 3 families
              </span>
              <div className="grid gap-3 lg:grid-cols-3">
                {UX_FAMILY_RECIPES.map((recipe) => (
                  <Item
                    key={recipe.family}
                    variant="outline"
                    size="sm"
                    className="flex-col items-stretch"
                  >
                    <ItemContent className="gap-2">
                      <ItemTitle size="heading">{recipe.family}</ItemTitle>
                      <ItemDescription>
                        Entry: {recipe.entry}
                      </ItemDescription>
                      <ItemDescription>
                        Success: {recipe.success}
                      </ItemDescription>
                      <ItemDescription>
                        Recovery: {recipe.recovery}
                      </ItemDescription>
                      <ItemDescription>
                        Show/hide · density: {recipe.density}
                      </ItemDescription>
                      <p className="font-mono text-3xs text-muted-foreground break-all">
                        {recipe.exemplar}
                      </p>
                    </ItemContent>
                  </Item>
                ))}
              </div>
            </div>

            {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: dev-only design lab annotation, never shipped to product surfaces */}
            <Caption>
              Quy tắc ẩn/hiện: trạm bếp ẩn giá và báo cáo tháng; chi nhánh cảm
              ứng ẩn lưới chỉ số cấp tổng và bảng dữ liệu dày trên điện thoại;
              danh sách cấp tổng hiện hàng chờ và bộ lọc trên đường dẫn, ẩn
              khung bảng trạm. Trục đầy đủ: docs/ref/screen-context-map.md §1A.
            </Caption>
          </div>
        </AppSection>

        <AppSection
          title="11 · Motion · CSS animations"
          headingLevel="h2"
          description="Existing --motion-* / --ease-* tokens + Base UI transition recipes on Dialog/Sheet (opacity/transform). No parallel motion system."
        >
          <div className="flex flex-col gap-4">
            <Caption>
              App surfaces author duration-150 / 300 (== --motion-base /
              --motion-progress). Primitives consume finer rungs via
              duration-[var(--motion-*)]. Global prefers-reduced-motion
              backstop in globals.css zone 4.
            </Caption>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MOTION_TOKENS.map((token) => (
                <Item key={token.name} size="xs" variant="outline">
                  <ItemContent className="flex-row items-baseline justify-between gap-2">
                    <ItemTitle className="font-mono text-3xs">
                      {token.name}
                    </ItemTitle>
                    <ItemDescription className="font-mono text-3xs shrink-0">
                      {token.value}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Hover / focus · Button + Item
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Hover me</Button>
                  <Button size="sm" variant="outline">
                    Outline
                  </Button>
                  <Item
                    size="xs"
                    variant="outline"
                    className="max-w-xs cursor-default"
                    render={<a href="#motion-item" />}
                  >
                    <ItemContent>
                      <ItemTitle>Item link hover</ItemTitle>
                      <ItemDescription>
                        transition-colors duration-[var(--motion-fast)]
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
                <Caption>
                  Button: transition-[bg,border,color,shadow,filter,transform]
                  + active:scale. Item [a]:hover:bg-muted.
                </Caption>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Loading · Spinner
                </span>
                <div className="flex items-center gap-3">
                  <Spinner className="size-5" />
                  <span className="text-2xs text-muted-foreground">
                    Spinner · --motion-spinner (700ms)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Enter · fade / slide (CSS transitions + tw-animate demos)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEnterDemoKey((k) => k + 1)}
                >
                  Replay enter
                </Button>
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  Dialog zoom
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSheetOpen(true)}
                >
                  Sheet slide
                </Button>
              </div>
              <Item
                key={enterDemoKey}
                variant="outline"
                size="sm"
                className="flex-col items-stretch motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-150"
              >
                <ItemContent>
                  <ItemTitle>Fade + slide-in-from-bottom</ItemTitle>
                  <ItemDescription>
                    Dialog/Sheet open-close use transition-[opacity,transform] with
                    data-[starting-style]/ending-style] (Base UI). This Item demo
                    still uses motion-safe:animate-in for one-shot remount enter.
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Caption>
                Deferred / token gap: no dedicated page-transition or list-stagger
                utilities yet — do not invent; promote a recipe into globals.css
                only after reuse. Mascot sprite loops stay brand-only
                (motion-safe:animate-cotlet-*).
              </Caption>
            </div>

            <Caption>
              Reduced motion: @media (prefers-reduced-motion: reduce) sets
              animation/transition duration to ~0 app-wide. Looping attention
              motion must also use motion-safe: (defense-in-depth).
            </Caption>
          </div>
        </AppSection>

        <AppSection
          title="12 · States"
          headingLevel="h2"
          description="Skeleton, empty, error, and disabled — same tokens / status vocabulary across planes."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Item variant="outline" size="sm" className="flex-col items-stretch">
              <ItemContent>
                <ItemTitle>Skeleton · busy</ItemTitle>
                <div aria-busy="true" className="mt-2 flex flex-col gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-5/6" />
                </div>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm" className="flex-col items-stretch">
              <ItemContent>
                <ItemTitle>Empty · no-results</ItemTitle>
                <div className="mt-2">
                  <AppEmptyState mode="no-results" compact />
                </div>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm" className="flex-col items-stretch">
              <ItemContent>
                <ItemTitle>Error · destructive</ItemTitle>
                <div className="mt-2">
                  <Alert variant="destructive">
                    <IconCircleAlert />
                    <AlertTitle>Request failed</AlertTitle>
                    <AlertDescription>
                      Use Alert destructive — do not invent a parallel error card.
                    </AlertDescription>
                  </Alert>
                </div>
              </ItemContent>
            </Item>
            <Item variant="outline" size="sm" className="flex-col items-stretch">
              <ItemContent>
                <ItemTitle>Disabled controls</ItemTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button disabled size="sm">
                    Disabled button
                  </Button>
                  <Input
                    disabled
                    placeholder="Disabled input"
                    className="max-w-[12rem]"
                  />
                  <Switch disabled aria-label="Disabled switch" />
                </div>
              </ItemContent>
            </Item>
          </div>
        </AppSection>

        <AppSection
          title="13 · Work compose · TASK_*"
          headingLevel="h2"
          description="Công việc control_surface recipes — compose-styles SSOT; month grid is not ui/calendar DayPicker."
        >
          <div className="flex flex-col gap-4">
            <Caption>
              {`WORK_LIST_ITEM_INSET mirrors LIST_ITEM_INSET (${LIST_ITEM_INSET}). Import constants from work/_lib/compose-styles.ts — do not fork strings in route bodies.`}
            </Caption>
            <div className="grid gap-3 md:grid-cols-2">
              <Frame className={WORK_KANBAN_COLUMN}>
                <span className="text-sm font-semibold">Kanban column</span>
                <Item variant="outline" size="xs">
                  <ItemContent>
                    <ItemTitle>Task card</ItemTitle>
                  </ItemContent>
                </Item>
              </Frame>
              <Frame className={WORK_MONTH_CELL}>
                <span className="text-xs font-semibold tabular-nums">12</span>
                <Button variant="secondary" size="xs" className={WORK_TASK_CHIP}>
                  Due task chip
                </Button>
              </Frame>
            </div>
            <Frame className={WORK_TIMELINE_ROW}>
              <span className="truncate text-sm font-medium">Timeline row</span>
              <Progress value={42} className="col-span-2 h-3 rounded-full" />
            </Frame>
            <ItemGroup className={WORK_LIST_ITEM_INSET}>
              <Item variant="outline" size="xs">
                <ItemContent>
                  <ItemTitle>Inbox Item row</ItemTitle>
                  <ItemDescription>WORK_LIST_ITEM_INSET</ItemDescription>
                </ItemContent>
              </Item>
            </ItemGroup>
          </div>
        </AppSection>
      </div>
    </AppPage>
  );
}

"use client";

import { useState } from "react";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Slider } from "@comtammatu/ui/components/slider";

import { AppDialog } from "@/components/form/form-dialog";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";

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

function Swatch({ name, swatch }: { name: string; swatch: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("h-10 w-full rounded-sm border border-border", swatch)} />
      <span className="font-mono text-3xs text-muted-foreground">{name}</span>
    </div>
  );
}

export function DsLabClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sliderValue, setSliderValue] = useState(40);

  return (
    <AppPage as="main" width="wide" scroll>
      <div className="flex flex-col gap-4">
        <AppPageHeader
          eyebrow="Internal"
          title="Design System Lab"
          description="Dev-only surface for the semantic token set and Base UI primitives. Toggle the app theme to compare light and night in place."
          badge={{ children: "dev only", variant: "warning" }}
        />

        <AppSection
          title="1 · Tokens"
          headingLevel="h2"
          description="Semantic surfaces and status roles. Every token below is defined twice in globals.css — once for light, once for .dark — so a swatch that changes hue on theme toggle is correct and one that does not is drift."
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {SURFACE_TOKENS.map((token) => (
                <Swatch key={token.name} {...token} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ACTION_TOKENS.map((token) => (
                <Swatch key={token.name} {...token} />
              ))}
            </div>
          </div>
        </AppSection>

        <AppSection
          title="2 · Typography"
          headingLevel="h2"
          description="Named scale only — arbitrary text-[…] sizes fail the UI contract."
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
          title="4 · Controls"
          headingLevel="h2"
          description="Button, Input, Badge and Slider render through Base UI primitives wrapped in @comtammatu/ui."
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
              <div className="flex flex-col gap-1">
                <Label htmlFor="ds-lab-input-default">Input · default</Label>
                <Input id="ds-lab-input-default" placeholder="h-7" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ds-lab-input-field">Input · field</Label>
                <Input
                  id="ds-lab-input-field"
                  controlSize="field"
                  placeholder="h-10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ds-lab-input-touch">Input · touch</Label>
                <Input
                  id="ds-lab-input-touch"
                  controlSize="touch"
                  placeholder="min-h-12"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BADGE_TONES.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
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
          title="5 · Overlays"
          headingLevel="h2"
          description="Both overlays animate with CSS data-[starting-style] / data-[ending-style] transitions — no JS animation runtime."
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

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Sheet</SheetTitle>
                <SheetDescription>
                  Side panel with safe-area padding and slide enter/exit.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Close
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </AppSection>

        <AppSection
          title="6 · Dense list row"
          headingLevel="h2"
          description="Item at size xs is the dense operational row: code, name, quantity, action."
          contentFlush
        >
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
        </AppSection>
      </div>
    </AppPage>
  );
}

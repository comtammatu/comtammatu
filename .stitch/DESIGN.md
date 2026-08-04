---
version: alpha
name: Má Tư Design System
description: >-
  Dual-thesis restaurant OS — Quản lý hệ thống (control_surface) dense management
  and Vận hành bán hàng (branch_surface + station_chrome) touch-first operations.
  Same tokens; different density and chrome per half.
colors:
  background: "oklch(0.978 0.014 64.3)"
  foreground: "oklch(0.218 0.036 251.3)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.52 0.18 33)"
  primary-foreground: "oklch(0.978 0.014 64.3)"
  muted: "oklch(0.935 0.012 67.7)"
  muted-foreground: "oklch(0.512 0.09 62.2)"
  secondary: "oklch(0.945 0.014 64.7)"
  border: "oklch(0.86 0.025 72)"
  ring: "oklch(0.62 0.14 55)"
  destructive: "oklch(0.466 0.147 33.3)"
  success: "oklch(0.48 0.09 137)"
  warning: "oklch(0.5 0.13 73.2)"
  accent: "oklch(0.936 0.018 70.2)"
  night-background: "oklch(0.155 0.016 50)"
  night-foreground: "oklch(0.94 0.018 75)"
  night-card: "oklch(0.23 0.018 48)"
  night-primary: "oklch(0.63 0.155 36)"
typography:
  page-title:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: 600
    letterSpacing: -0.02em
  section-title:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: 600
  body:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: 500
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Geist Mono
    fontSize: 0.875rem
    fontWeight: 400
rounded:
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
spacing:
  page-mobile: 0.75rem
  page-default: 1rem
  section-gap: 1rem
  section-gap-compact: 0.75rem
  inline-gap: 0.5rem
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 2rem
  button-primary-touch:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 3rem
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 1rem
---

# Design System: Má Tư Design System

**Authority:** Runtime SSOT is `docs/spec/design-system.md` + `packages/ui/src/styles/globals.css`.
This file is the **Stitch/agent mirror only** — never overrides the repo contract alone.

## Overview

Má Tư Design System serves **Product Dual Thesis** (`docs/spec/architecture.md`):

1. **Quản lý hệ thống** (`control_surface`) — dense tables, filters, document forms, oversight. Adapters: `App*`. Chrome: `AppShell` + nav-as-data.
2. **Vận hành bán hàng** (`branch_surface` + `station_chrome`) — touch-first shift work, POS/KDS/Runner live queues. Adapters: `BranchOperator*` / station.

Visual tone: rice-cream foundation (kem gạo), terracotta primary (đỏ gạch), deep navy text, warm rice-yellow accents, restrained borders, semantic status colors. Night mode is warm-dark “gạo cháy”, not cool navy.

Calm, fast, touch-safe, business-specific — not generic SaaS grey.

## Colors

- **Background:** warm rice cream — page foundation.
- **Foreground:** deep navy — primary reading text (light mode).
- **Primary:** terracotta — sole primary CTA / key action.
- **Muted foreground:** warm wood brown — secondary copy; must stay ≥4.5:1 on background and muted.
- **Border:** warm hairline; must approach WCAG 1.4.11 (≥3:1) against background for inputs/tables.
- **Ring:** darker rice-gold for focus visibility (≥3:1 on background in light).
- **Success / warning / destructive:** ink-capable status hues on cream; use tint `/10` `/15` `/20` scale for surfaces.

Night: cream foreground on warm-dark background; cards must lift above background (ΔL ≥ ~0.05) for surface hierarchy.

## Typography

- **Headings:** Geist, `font-semibold` (not bold except named exceptions).
- **Body:** Geist; management cards often `text-xs` density; page descriptions may use `text-sm`.
- **Data:** Geist Mono for prices, IDs, quantities, timestamps.
- Root `html` font-size 17px.
- Page H1 via `AppPageHeader` — title = page job; **no** module-name eyebrow on control_surface (sidebar owns module context).

## Layout

- **Hệ thống:** `AppPage` width tiers (`default` / `wide` / `xwide`), outer `p-3`/`p-4`, section `gap-4`/`gap-3`. LIST: `AppPage` → `AppPageHeader` → `AppListFrame` + `AppToolbar` → `DataTable`. DOC: `DocumentFormFrame`.
- **Vận hành:** `BranchOperatorPage` / panels; sticky footers; bottom-nav on branch; stations full-bleed.
- Sticky LIST filters cancel shell pad via negative sticky `top` + horizontal bleed when stuck.

## Elevation & Depth

Border-first at rest. Elevation for floating chrome (popover, dialog, sticky CTA). Night cards must not merge into background — prefer stronger card L or border alpha before decorative shadows.

## Shapes

Radius scale from `--radius` 0.625rem (`sm`/`md`/`lg`). Architectural softness, not pill-heavy chrome.

## Components

- Primitives: Base UI anatomy in `@comtammatu/ui` (`Button`, `Card`, `Table`, `Field`, …).
- Hệ thống adapters: `AppPage`, `AppPageHeader`, `AppSection`, `AppListFrame`, `AppToolbar`, `DocumentFormFrame`, `AppEmptyState`.
- Vận hành adapters: `BranchOperatorPage`, `BranchOperatorPanel`, station boards.
- Suffix glossary: Shell = chrome only; Page = content rhythm; Frame = inset or registered workflow wrapper — never chrome.
- Prefer `AppListFrame` over the `InventoryListFrame` compatibility alias.

## Do's and Don'ts

- Do keep one Má Tư Design System name — never “Concept 01”.
- Do express Dual Thesis in folders, shells, and adapter prefixes.
- Do seed Stitch from this mirror + `design-system.md`; implement with registered adapters only.
- Don't invent a second theme or root `DESIGN.md`.
- Don't use module-name eyebrows on control_surface headers.
- Don't merge `/inventory` and `/br/.../stock` URLs — share implementation, keep two jobs.
- Don't use `shadcn-ui` / `stitch-loop` stitch skills as authority.
- Do target WCAG AA text (4.5:1) and UI non-text 1.4.11 (3:1) for border/card/focus.

## Contrast audit notes (2026-07-29)

Prior findings (pre-tune): light border/bg ~1.25:1; card/bg ~1.07:1; ring/bg ~2:0; night card/bg ~1.07:1.
Target after token tune: stronger light border + ring; night card L raised — re-verify with `@google/design.md lint` and runtime screenshots.

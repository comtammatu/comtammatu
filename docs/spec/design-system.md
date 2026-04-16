# Design System - Cơm Tấm Má Tư Web App

> Version: 12.0.0 | Updated: 2026-04-16

## Active Preset

Preset runtime:

- `style`: `radix-mira`
- `baseColor`: `taupe`
- `cssVariables`: `true`
- `iconLibrary`: `lucide`

## Foundation

`apps/web/app/globals.css` va `apps/web/app/layout.tsx` phai o trang thai stock-shadcn-first:

- token theo preset
- font runtime toi thieu
- base body/html styles
- khong co helper layer rieng

## Shared UI

`packages/ui/src/components/*` la primitive layer duy nhat.

App-level wrappers duoc phep ton tai cho structure, nhung khong duoc tao mot design language rieng.

## Forbidden

- `app-*` helpers
- custom global chrome/background/theme
- primitive overrides theo page/surface
- compatibility shim cho design system cu

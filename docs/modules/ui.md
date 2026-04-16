# UI Module

## Overview

UI cua repo phai di truc tiep tren `shadcn/ui` preset hien hanh. Khong con helper layer hay theme system rieng cua du an.

Source of truth:

1. `apps/web/components.json`
2. `packages/ui/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`

## Reset Contract

Reset hien tai duoc thuc hien bang `shadcn` preset `b1GfmQMCm` / `radix-mira` cho `apps/web`.

Dieu nay co nghia:

- foundation phai theo file do `shadcn` bootstrap sinh ra
- page/shell chi duoc compose tu primitives co san
- khong duoc giu `app-*` helper classes
- khong duoc giu custom background/theme chrome o root

## Primitive Layer

Primitive source van song tai `packages/ui/src/components/*`, nhung phai tiep tuc theo cau truc shadcn:

- `button`
- `card`
- `sidebar`
- `badge`
- `table`
- `dialog`
- `sheet`
- `tabs`
- `input`
- `select`

Khong fork primitive theo surface.

## Composition Rules

Cho phep:

- wrapper nho de tap hop du lieu, nav, va structure
- dung `className` de sap xep layout co ban
- compose truc tiep tu shadcn primitives

Khong cho phep:

- helper class kieu `app-*`
- custom theme layer
- wrapper override visual contract cua primitive
- per-surface `theme.css`
- shell chrome tu che de thay cho stock shadcn structure

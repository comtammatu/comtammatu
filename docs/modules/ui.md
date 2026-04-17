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
- dung `div` / `span` / `p` thuong de gia lap `Card`, `Badge`, `Button`, `Table`, `Tabs`, `Input`, `Select`
- per-surface `theme.css`
- shell chrome tu che de thay cho stock shadcn structure

Quy tac review:

- neu UI trong giong `card` thi phai dung `Card`
- neu UI trong giong `badge/chip` thi phai dung `Badge`
- neu UI trong giong `button` thi phai dung `Button`
- neu UI trong giong bang du lieu thi phai dung `Table`
- neu khong co primitive phu hop, dung lai va thong nhat truoc khi them pattern moi

## Operational Surfaces

POS va KDS la surface van hanh, khong phai dashboard.

Dieu nay co nghia:

- first viewport tren mobile phai uu tien action chinh hoac hang doi song
- sau khi khoa context (ca, ban, tram, don), shell phai co gon de nhuong cho tac vu chinh
- analytics, hero copy, progress block chi la secondary content; khong duoc day queue/cart xuong duoi fold
- desktop co the them mat do thong tin, nhung khong duoc tao IA khac mobile
- neu control trong giong `Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Progress` thi phai dung primitive that, khong tu style raw `div` / `button`

Review heuristic:

- POS/KDS truoc het phai giup nhan vien lam thao tac tiep theo nhanh hon
- mot workflow state chi nen co mot noi the hien chinh
- destructive action phai tach khoi primary action va co confirm / recovery

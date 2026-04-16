# Design System - Cơm Tấm Má Tư Web App

> Version: 11.0.0 | Updated: 2026-04-16
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

UI runtime cua repo phai duoc doc theo thu tu:

1. `packages/ui/components.json`
2. `apps/web/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`
5. tai lieu nay

Neu code doi, docs phai doi cung luc.

## Active shadcn Preset

Preset hien tai:

- `style`: `radix-mira`
- `baseColor`: `taupe`
- `cssVariables`: `true`
- `menuColor`: `default`
- `menuAccent`: `subtle`
- base library: `radix`
- primitive source: `packages/ui/src/components/*`

## Runtime Foundation

`apps/web/app/globals.css` va `apps/web/app/layout.tsx` chi duoc giu:

- token cua preset
- font runtime mapping
- base body/html styles
- compatibility shims toi thieu cho route chua cleanup xong

Khong duoc tiep tuc dung foundation de tao:

- background texture rieng
- page chrome rieng
- presentation system vuot ra ngoai preset

## Primitive Contract

Primitive layer tiep tuc di qua:

- `Button`
- `Card`
- `Sidebar`
- `Badge`
- `Table`
- `Dialog`
- `Sheet`
- `Tabs`
- `Input`
- `Select`

Primitive phai giu theo shadcn structure. Khong tao primitive fork song song.

## Composition Contract

Composition layer duoc phep:

- dung primitive truc tiep
- sap xep layout bang utility classes co san
- them wrappers nho de tap hop behavior hoac structure

Composition layer khong duoc:

- redefine visual contract cua primitive
- hop thuc hoa `app-*` helpers thanh design language moi
- dua page-level styling thanh source of truth

## Compatibility Policy

`app-*` helper classes duoc giu lai chi de tranh blast radius trong migration.

Dieu nay co nghia:

- new work khong duoc them usage moi
- helper cu phai duoc thu hep dan ve utility/token co san
- khi sua wrapper/shared shell, uu tien bo phu thuoc vao helper va quay ve shadcn primitives

## Reset Policy

Repo chi duoc xem xet reset UI surface va chay lai:

`pnpm dlx shadcn@latest init --preset b1GfmQMCm --template next`

khi audit cho thay refactor tang foundation/composition khong con kha thi. Day khong phai duong mac dinh.

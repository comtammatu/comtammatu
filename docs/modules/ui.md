# UI Module

## Overview

UI cua repo phai di theo `shadcn/ui` preset hien hanh, khong duoc mo them mot design system song song.

Thu tu source of truth:

1. `packages/ui/components.json`
2. `apps/web/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`

Tai lieu nay chi mo ta runtime va governance dang duoc phep. Neu runtime doi, docs phai doi cung luc.

## Active Preset

Repo dang chay voi:

- `style`: `radix-mira`
- `baseColor`: `taupe`
- `cssVariables`: `true`
- `iconLibrary`: `lucide`
- `rsc`: `true`

Monorepo da duoc `shadcn` CLI nhan dien hop le tai `apps/web` va `packages/ui`.

## Allowed Layers

### 1. Foundation

Song trong `apps/web/app/globals.css` va `apps/web/app/layout.tsx`.

Foundation chi duoc:

- khai bao preset token / CSS variables
- map font runtime
- dat base styles toan app
- giu cac helper tương thich toi thieu cho surface cu

Foundation khong duoc:

- tao background chrome rieng theo page
- them grid/gradient/trang tri vuot qua preset
- tro thanh mot theme system doc lap

### 2. Primitives

Song trong `packages/ui/src/components/*`.

Primitives la nguon chuan cho:

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

Khong fork primitive theo domain. Neu can thay doi primitive, phai di theo `shadcn` structure/preset.

### 3. Composition

Song trong `apps/web/app/components/*` va route shells.

Composition chi duoc:

- sap xep layout bang primitive san co
- truyen `className` muc toi thieu de sap xep spacing/layout
- reuse variants/tokens da ton tai

Composition khong duoc:

- doi visual contract cua primitive
- them shadow/radius/chrome rieng nhu mot he thong moi
- hop thuc hoa helper classes thanh API UI chinh thuc

## Compatibility Helpers

Mot so `app-*` helper classes van con ton tai de giu cac route cu chay on dinh trong qua trinh thu hep UI.

Quy tac:

- chi duoc coi la compatibility shim
- khong duoc them helper moi
- khong duoc nang cap chung thanh visual language rieng
- new work phai compose truc tiep tu shadcn primitives thay vi dua vao helper nay

## Governance

- Preset truoc, page sau.
- Docs phai khop runtime.
- Khong co `theme.css` theo surface.
- Khong co inline static presentation trong shell/auth/mobile chrome.
- Gap yeu cau vuot kha nang bieu dat cua preset hien tai thi dung lai va escalate, khong tu che them UI.
- Reset UI bang `pnpm dlx shadcn@latest init --preset b1GfmQMCm --template next` chi la fallback cuoi cung va chi duoc lam khi co phe duyet ro rang.

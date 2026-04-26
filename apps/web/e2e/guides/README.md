# User-guide capture (Playwright project `guides`)

Sinh ảnh mockup iPhone cho [docs/user-guides/](../../../../docs/user-guides/) bằng cách:

1. Login bằng cashier test (reuse [auth.setup.ts](../auth.setup.ts)).
2. Đặt DB của test branch về state cần thiết qua service-role (`_lib/fixtures.ts`).
3. Navigate POS, screenshot viewport iPhone 390×844.
4. Compose iPhone bezel + annotation overlay qua page thứ 2 (`_lib/frame.ts`).
5. Lưu PNG vào `docs/user-guides/<module>/mockups/<flow>/`.

## Chạy

Yêu cầu: dev server đang chạy (`pnpm dev`) và `.env.test.local` có credentials.

```bash
# Tất cả flow
pnpm --filter @comtammatu/web guides:capture

# Một flow cụ thể
pnpm --filter @comtammatu/web guides:capture --grep="POS-01"

# Liệt kê scenario
pnpm --filter @comtammatu/web guides:capture --list
```

## Cấu trúc

```
e2e/guides/
├── _lib/
│   ├── types.ts        — Scenario, Annotation type definitions
│   ├── paths.ts        — viewport, output dir constants
│   ├── frame.ts        — HTML template ghép iPhone bezel + annotation overlay
│   ├── fixtures.ts     — DB state setup helpers (service-role)
│   └── capture.ts      — captureScenario(test) utility
├── pos-01-open-session.guide.ts
└── README.md
```

## Thêm flow mới

Copy `pos-01-open-session.guide.ts` thành `pos-XX-{slug}.guide.ts`, thay scenario list. File phải `.guide.ts` (regex match `/guides\/.*\.guide\.ts/`).

## Lưu ý

- Capture **mutate DB** của test branch (đóng/mở ca, etc.). KHÔNG chạy lên DB production.
- Output dir nằm ngoài `apps/web` (gốc repo) — capture dùng path tương đối lên 4 cấp. Xem `_lib/paths.ts`.
- Frame compose dùng page thứ 2 với viewport 460×920 (không cần auth). Same browser, khác context.

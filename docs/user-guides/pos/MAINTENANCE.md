# Bảo trì mockup POS

> Tài liệu này dành cho **kỹ thuật/đào tạo**, không phải nhân viên vận hành.

## Khi nào cần refresh mockup

- UI POS thay đổi (component layout, copy, màu sắc).
- Đổi viewport mặc định (ví dụ chuyển từ iPhone 390×844 sang iPad).
- Cập nhật annotation (mũi tên, callout) trong flow.

## Yêu cầu

1. **Dev server chạy:** `pnpm dev` (Next.js ở port 3000).
2. **File `.env.test.local`** có:
   - `E2E_CASHIER_EMAIL`
   - `E2E_CASHIER_PASSWORD`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (để fixtures đặt state cụ thể qua DB)
3. **Tài khoản cashier test** đã có quyền `pos:open_cashbox` trên branch_id=1 (mặc định).

> ⚠️ Capture script CÓ MUTATE DB của test branch (đóng ca, mở ca giả lập, etc.). KHÔNG chạy trên DB production.

## Lệnh

```bash
# Capture toàn bộ flow đã có
pnpm --filter @comtammatu/web guides:capture

# Capture chỉ POS-01
pnpm --filter @comtammatu/web guides:capture --grep="POS-01"

# Liệt kê scenario sẽ chạy (không capture)
pnpm --filter @comtammatu/web guides:capture --list
```

Output PNG ghi vào `docs/user-guides/pos/mockups/<flow-id>/`.

## Workflow refresh

```text
UI POS đổi → dev xác minh trong browser
   ↓
Chạy guides:capture cho flow bị ảnh hưởng
   ↓
git diff docs/user-guides/pos/mockups/   # xem ảnh nào đổi
   ↓
Đọc lại text trong flow .md xem có sai logic không
   ↓
Cập nhật metadata cuối flow:
   - Cập nhật mockup gần nhất: <ngày hôm nay>
   - Commit POS bám: <git rev-parse --short HEAD>
   ↓
Commit ảnh + .md cùng PR
```

## Cấu trúc capture infra

```
apps/web/e2e/guides/
├── _lib/
│   ├── types.ts          — Scenario, Annotation type definitions
│   ├── frame.ts          — HTML template ghép iPhone bezel + annotation
│   ├── fixtures.ts       — DB state setup (đóng ca, mở ca giả, etc.) qua service role
│   ├── paths.ts          — đường dẫn output, viewport constants
│   └── capture.ts        — captureScenario() utility
└── pos-01-open-session.guide.ts
```

Mỗi `.guide.ts` là một Playwright spec — được khai báo trong project `guides` ở [apps/web/playwright.config.ts](../../../apps/web/playwright.config.ts).

## Đổi viewport (ví dụ sang iPad/Android)

Sửa `VIEWPORT` trong [apps/web/e2e/guides/_lib/paths.ts](../../../apps/web/e2e/guides/_lib/paths.ts), rồi:

```bash
pnpm --filter @comtammatu/web guides:capture
```

Frame HTML trong `frame.ts` tự co theo viewport mới (header và padding scale theo width).

## Kiểm tra trực quan

Mở `docs/user-guides/pos/mockups/pos-01/` trong VS Code hoặc bất kỳ image viewer nào để xem PNG đã sinh đúng chưa.

Nếu một annotation lệch vị trí (do UI đổi selector), sửa selector trong file `.guide.ts` tương ứng.

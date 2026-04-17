# Next Session Prompt — Shadcn Migration M4/M5/M8

> Copy-paste prompt dưới đây để bắt đầu session tiếp theo. Prompt stand-alone (không phụ thuộc session trước).

---

Tiếp tục shadcn/ui migration cho repo Cơm Tấm Má Tư. M1-M3 đã ship (12 commits, từ `7a78502` đến `378603a`). Giờ triển khai **M4 (Item primitive) + M5 (Input Group) + M8 (Sidebar collapsible + Breadcrumb)** — đây là 3 milestone UI polish nhẹ, mechanical, ít rủi ro.

## Context đã có

- Project dùng shadcn `radix-mira` style, 49 primitives ở `packages/ui/src/components/`
- Form helpers đã tạo ở `apps/web/app/components/form/` — không cần đụng M3 nữa
- Build gate: `pnpm typecheck && pnpm lint && pnpm build` phải pass sau mỗi batch
- User batch workflow: commit sau 2-5 file, defer visual QA cho user (đừng start dev server)

## M4 — Item primitive rollout

Scope:
1. [admin-shell.tsx:263-310](apps/web/app/admin/components/admin-shell.tsx:263) — 4 metric cards + avatar card viết tay. Thay bằng `Item` + `ItemMedia` + `ItemContent` + `ItemTitle` + `ItemDescription` + `ItemActions`.
2. [ingredient-table.tsx:125-160](apps/web/app/inventory/ingredient-table.tsx:125) — mobile card rows (flex layout thủ công). Convert sang `Item` với `size="sm"`.
3. Các chỗ tương tự: mobile list rows trong inventory (stock, stocktake, grn, transfers). Grep pattern: `className="flex items-center.*gap-3.*p-3"`.

Expected LOC: −200 tổng (mỗi conversion tiết kiệm ~5-10 LOC).

## M5 — Input Group rollout

Scope: search boxes đang bọc `Card > Input + Search icon + counter` (anti-pattern).

Mục tiêu:
1. [ingredient-table.tsx:100-111](apps/web/app/inventory/ingredient-table.tsx:100) — `Card > Input + Search + counter` → `InputGroup` + `InputGroupAddon` (icon) + `InputGroupAddon align="end"` (counter).
2. Grep các file khác có pattern tương tự: `apps/web/app/**/*-table.tsx`, `*-client.tsx` — search boxes trong POS menu, KDS filter, stock, orders, suppliers.
3. Component Input Group đã có sẵn ở [packages/ui/src/components/input-group.tsx](packages/ui/src/components/input-group.tsx).

## M8 — Sidebar collapsible + Breadcrumb

Scope:
1. [admin-shell.tsx](apps/web/app/admin/components/admin-shell.tsx) — bật `collapsible="icon"` default cho desktop ≥1280px. Test với `SidebarTrigger` mobile vẫn hoạt động.
2. Thay string `" · "` trail (line 128) bằng `Breadcrumb` + `BreadcrumbItem` + `BreadcrumbSeparator` component chuẩn.
3. `inventory-shell.tsx` + `employee` layout — apply cùng Breadcrumb pattern nếu có trail.

## Cách làm (theo user workflow)

1. Pick M4 trước (ít risk), sau đó M5 (cần grep scan), cuối cùng M8 (impact lớn cho admin shell).
2. Mỗi milestone chia 2-3 batch nhỏ. Commit sau mỗi batch.
3. Commit message format: `refactor(ui): M{N} batch {X} — {scope}` + co-author tag.
4. KHÔNG start dev server. User QA manual khi session kết thúc.
5. Nếu gặp file >300 LOC hoặc layout phức tạp, hỏi user trước khi continue.
6. Skip patterns đã ship: không touch Empty wrappers, Spinner, FormDialog, form helpers.

## References

- Memory: `MEMORY.md` trong `~/.claude/projects/...-comtammatu-dev/memory/`
- Status: [docs/plan/decisions.md](docs/plan/decisions.md) D010
- Migration trạng thái: [tasks/todo.md](tasks/todo.md) "Shadcn primitive rollout" section
- CLAUDE.md: 4-agent debate protocol (skip được cho mechanical refactor theo pattern đã validate)

## Acceptance

Session thành công khi:
- M4 done (ít nhất admin-shell + 1 mobile card pattern)
- M5 done (ít nhất ingredient-table + 1 search box khác)
- M8 done (sidebar collapsible bật + Breadcrumb thay string trail)
- Tất cả commits build pass
- Report tổng kết với commit hash cho mỗi milestone

# Baseline Decision Brief — Má Tư Design System

> Mốc: C0
> Phạm vi: source/docs/static gates tại worktree `codex/design-system-rollout`
> Quyết định: giữ foundation hiện hành, tune debt có bằng chứng, không dựng lại một Design System cạnh tranh.

## 1. Kết luận

Baseline hiện tại đã có đúng authority và layering:

```text
Base UI behavior
→ @comtammatu/ui styled primitives
→ app/workflow adapters
→ route/domain UI
```

Không có bằng chứng để chạy `shadcn init`, tạo CSS root thứ hai, thay Base UI, xóa `Field`/`FormField` hoặc rebuild toàn bộ `@comtammatu/ui`. Chương trình tiếp tục theo hướng convergence: xóa debt chết, khóa contract bằng guard, bổ sung accessibility/PWA runtime evidence và rollout từng route family.

## 2. Baseline định lượng

| Hạng mục | Kết quả | Quyết định |
| --- | --- | --- |
| Page census | 123/123 page được map; không thiếu hoặc stale | Giữ archetype registry; P6 review từng route |
| Archetype | LIST 46, DETAIL 16, SETTINGS-PANEL 13, DOC-WORKFLOW 12, LANDING 9, EMBED-WRAPPER 8, REPORT 6, BOARD 3, DASHBOARD 3, GATE/AUTH 3, REDIRECT-SHIM 3, PUBLIC-WORKFLOW 1 | Không thêm archetype mới |
| Shared UI adoption | Registry phân loại toàn bộ shared/app/domain adapters; các blocking-zero signal hiện bằng 0 | Giữ registry và ratchet |
| Base UI boundary | Direct imports chỉ nằm trong `packages/ui` | Giữ và tiếp tục block app escape |
| CSS SSOT | Chỉ có `packages/ui/src/styles/globals.css` | Giữ một root |
| Legacy CSS variable names | Không có tên chứa `legacy`, `old`, `v1`, `compat` | Thêm preventive guard; không đụng `Field` |
| Raw palette / `transition-all` | Không có runtime finding | Giữ blocking-zero |
| Inline style | Chủ yếu là runtime geometry, CSS variables, chart/progress, theme/error boundary | Phân loại và ratchet; không mass-delete |
| Shadcn | Không có runtime config hoặc generated component | Giữ reference-only |
| Accessibility automation | Chưa có `@axe-core/playwright` | Bổ sung ở P3 |
| PWA | SW boundary và static tests đúng; runtime browser proof chưa đủ | Giữ strategy, bổ sung coverage/proof |

Static green không được coi là browser, assistive-technology hoặc Production proof.

## 3. Reconciliation external agents

| Agent | Kết quả thực tế | Finding dùng được |
| --- | --- | --- |
| `claude` | Hoàn thành read-only review, có evidence `path:line` | Ba custom utility không có consumer; số page `135` trong prose đã stale; giữ SW, registry, focus/motion foundation |
| `cursor-agent` | Hoàn thành plan-mode review, có evidence `path:line` | Thiếu keep/tune/rebuild census, thiếu axe, PWA proof mới là static, `Input.size` là compatibility alias có thể migrate |
| `agy` | Không tạo review dùng được | Headless bị chặn MCP permission; interactive báo chưa đăng nhập/hết credit. Không dùng unsafe permission bypass và không gán finding giả |

Codex đã kiểm chứng lại các finding được nhận bằng source hiện tại. Các đề xuất rebuild chung, đổi SW cache strategy, xóa `Field`/`FormField`, thay Button default toàn cục hoặc đưa Liquid Glass lên data/form workspace đều bị loại.

## 4. Debt classification được chốt

### Tune ngay tại shared owner

- Xóa `bg-glass-nav`, `scrollbar-thin` và `active-touch-press`: cả ba chỉ còn definition, không có consumer.
- Migrate toàn bộ `Input size=` sang `controlSize=` rồi xóa compatibility alias.
- Thêm guard cấm CSS variable name mang nghĩa legacy và cấm tái tạo `Input.size` alias.
- Sửa prose archetype `135` về current census; số liệu sống vẫn do script sở hữu.
- Bổ sung `@axe-core/playwright` và representative accessibility project.
- Bổ sung Runner manifest test để POS/KDS/Runner có contract coverage đối xứng.

### Giữ có chủ sở hữu

- Inline style cho chart, geometry, progress, CSS variable bridge, theme bootstrap và `global-error` boundary.
- Safe-area, print, PWA và dynamic-viewport utilities đang có consumer.
- Serwist `NetworkOnly` cho mutation/RSC/Supabase/Self-order/authenticated navigations.
- Reduced-motion global backstop và named motion tokens.
- Card/surface/component registry hiện hành.

### Route tune tranche đầu tiên

`/br/[branchId]/shift/checkout-approvals` được chọn làm tranche Branch runtime nhỏ vì có finding cụ thể: details Drawer dùng `ScrollArea` chỉ có `maxHeight`, label tự style và checklist tự dựng chrome. Fix ở shared staff-runtime presenter, không đổi loader/action/authority.

## 5. Disposition sơ bộ toàn repo

Ở C0, 123/123 page có disposition sơ bộ `keep` đối với authority/archetype hiện tại vì route census và UI contract đều xanh. `keep` ở đây chỉ có nghĩa “không có lý do source-level để rebuild”; không phải browser approval.

Các override ban đầu:

- `tune`: `/br/[branchId]/shift/checkout-approvals` theo finding ở trên.
- `tune`: representative public/auth/system surfaces để bổ sung axe evidence, không đổi IA.
- `tune`: PWA manifest/runtime test surface, không đổi cache strategy.
- `rebuild`: chưa có route nào đủ evidence tại C0.

P6 bắt buộc mở lại disposition theo UI Advisor Gate và runtime evidence cho từng route family. Một route chỉ giữ `keep` cuối cùng khi đã có viewport/state/accessibility evidence phù hợp.

## 6. UI Advisor Gate — Branch checkout approvals

```text
UI Advisor Gate
- Surface: /br/[branchId]/shift/checkout-approvals; route family: branch_shift; plane: Branch; change: visual + behavior
- Context: Branch shift approval workflow; actor: branch manager/owner; job: review and approve or reject a checkout request
- Journey: pending request → inspect checklist → approve/reject → row removed; recovery: close drawer or cancel confirmation
- Information order: 1) pending employee/request 2) checklist completion 3) secondary branch/shift detail; exclude: payroll and unrelated staff history
- Pattern: LIST, Branch review variant; exemplar: /br/[branchId]/shift/leave-approvals
- States: empty, no-permission, pending mutation, details, destructive confirmation, success/error feedback
- Components: Drawer, ItemGroup/Item, SectionLabel, Badge, Button, AppEmptyState; fallback: route-scoped composition only
- Responsive/accessibility: same touch IA; keyboard-operable row and drawer; visible label; sticky actions; scroll body must have a definite flex boundary
- Verification: focused static tests, 390/768/1024 runtime when authenticated environment is available, keyboard/focus and axe in representative suite
```

## 7. Thứ tự wave đã chốt

1. P2: dead CSS, compatibility alias, docs và guards.
2. P3: axe dependency/project/spec và focused accessibility fixes.
3. P4: xác nhận CSS/motion convergence sau ratchet.
4. P5: Runner coverage và production-like PWA proof boundary.
5. P6: Branch checkout approvals, rồi operational/global chrome tranches theo living plan.
6. P7: tối đa hai vòng observe/measure/challenge/fix/verify/encode cho mỗi tranche.

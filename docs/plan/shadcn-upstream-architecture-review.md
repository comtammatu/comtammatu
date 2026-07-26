# Điều tra kiến trúc shadcn/ui và Base UI

> Snapshot: kiểm tra ngày 2026-07-26 trên tài liệu chính thức, registry đang phục
> vụ và commit upstream
> [`7774cd7`](https://github.com/shadcn-ui/ui/tree/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf).
> Đây là thông tin nhạy theo phiên bản; cần kiểm tra lại trước một quyết định
> migration trong tương lai.

## Kết luận

Phát biểu “shadcn không dùng trực tiếp Base UI” **đúng ở lớp code màn hình nhưng
sai ở lớp component được cài vào dự án**:

- Code màn hình dùng API local như
  `@/components/ui/dialog`, đúng theo
  [tài liệu `Dialog`](https://ui.shadcn.com/docs/components/base/dialog#usage);
  nó không import Base UI trực tiếp.
- Khi dự án chọn base `base`, file component local do shadcn cung cấp lại
  **import trực tiếp** `@base-ui/react/dialog` và render primitive của Base UI.
  Có thể kiểm chứng đồng thời trong
  [registry JSON đang phục vụ](https://ui.shadcn.com/r/styles/base-nova/dialog.json)
  và
  [source upstream `dialog.tsx`](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/base/ui/dialog.tsx#L3-L15).

Vì vậy, mô hình chính xác là:

```text
shadcn CLI/registry
→ chép component source đã style vào dự án
→ component local import Base UI trực tiếp
→ page/feature import component local
```

## Các lớp cần phân biệt

| Lớp                 | Vai trò hiện hành                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI và registry     | Chọn template/style/base, giải dependency và ghi source vào dự án. `--base` hiện nhận `base`, `radix` hoặc `aria`; `Base UI` là mặc định từ tháng 7/2026, nhưng Radix và React Aria vẫn được hỗ trợ ([CLI](https://ui.shadcn.com/docs/cli#init), [Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [React Aria](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)).                                                                                                                                                                                          |
| Component được sinh | Là source local mà đội dự án sở hữu và có thể sửa. Với base `base`, wrapper như `Dialog` import `@base-ui/react/dialog`; wrapper đồng thời ghép API, anatomy và class Tailwind ([registry JSON](https://ui.shadcn.com/r/styles/base-nova/dialog.json)).                                                                                                                                                                                                                                                                                                                                            |
| Primitive           | Phụ thuộc runtime thay đổi theo base đã chọn: Base UI, `radix-ui`, hoặc `react-aria-components`. Ba implementation `Dialog` chính thức cho thấy khác biệt này ([Base UI](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/base/ui/dialog.tsx#L3-L15), [Radix](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/radix/ui/dialog.tsx#L3-L19), [React Aria](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/aria/ui/dialog.tsx#L3-L20)). |
| Styling             | Registry ghép Tailwind classes, CSS variables và các dependency như `class-variance-authority`; base `base` khai báo `@base-ui/react` cùng các dependency style ([base registry](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/base/registry.ts#L14-L31)).                                                                                                                                                                                                                                                                                  |
| Consumer app        | Import component local, không import một package component `shadcn/ui` ([ví dụ usage](https://ui.shadcn.com/docs/components/base/dialog#usage)).                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Không nên dùng câu tuyệt đối “shadcn không phải dependency”. Setup hiện tại thêm
`shadcn` làm dev dependency và import `shadcn/tailwind.css` ở bước build CSS.
Lệnh `shadcn eject` inline phần CSS này rồi gỡ dependency; điều đó khác với việc
page render component từ một package runtime shadcn
([tài liệu `eject`](https://ui.shadcn.com/docs/cli#eject),
[khai báo registry](https://github.com/shadcn-ui/ui/blob/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/base/registry.ts#L17-L23)).

## So với Cơm Tấm Má Tư

Má Tư không đặt lớp shadcn CLI/registry hoặc source generated làm authority.
`@comtammatu/ui` khai báo trực tiếp `@base-ui/react` và component `Dialog` import
primitive này trực tiếp
([`packages/ui/package.json`](../../packages/ui/package.json#L17-L27),
[`dialog.tsx`](../../packages/ui/src/components/dialog.tsx#L1-L24)).
App sau đó import component đã style qua `@comtammatu/ui`, ví dụ
[`app-shell.tsx`](../../apps/web/app/components/app-shell.tsx#L3-L12).

Do đó hai stack có thể cùng đi qua Base UI, Tailwind và CVA, nhưng quyền sở hữu
khác nhau:

```text
shadcn base=base:
registry shadcn → local shadcn component → Base UI

Má Tư:
@comtammatu/ui component → Base UI
```

Điều này khớp contract hiện hành: Base UI sở hữu headless behavior,
`@comtammatu/ui` sở hữu shared styled components, còn shadcn chỉ là nguồn đối
chiếu
([design-system.md](../spec/design-system.md#decision),
[design-system-rollout.md](./design-system-rollout.md#1-mục-tiêu-và-thứ-tự-bắt-buộc)).

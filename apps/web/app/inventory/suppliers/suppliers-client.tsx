"use client";

import { CheckCircle, MoreVertical, Pause, Plus, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge } from "../_components/shared";

export type SupplierItem = {
  id: number;
  name: string;
  code: string;
  taxId: string;
  phone: string;
  address: string;
  category: string;
  status: string;
};

// Color palette for supplier avatars
const avatarColors = [
  { bg: "var(--md-primary-fixed)", fg: "var(--md-primary)" },
  { bg: "var(--md-secondary-container)", fg: "var(--md-secondary)" },
  {
    bg: "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
    fg: "var(--md-tertiary)",
  },
  { bg: "var(--md-error-container)", fg: "var(--md-error)" },
  { bg: "var(--md-surface-high)", fg: "var(--md-on-surface-variant)" },
];

export function SuppliersClient({ suppliers }: { suppliers: SupplierItem[] }) {
  const active = suppliers.filter((s) => s.status === "active").length;
  const suspended = suppliers.filter((s) => s.status === "suspended").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Danh sách Nhà cung cấp
          </h2>
          <p
            className="mt-2 max-w-lg text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Quản lý thông tin liên hệ và điều khoản thanh toán của các đối tác
            cung ứng trong hệ thống.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-6 py-2.5 font-bold text-white shadow-xl transition-transform hover:scale-[1.02]"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            boxShadow: "0 4px 14px rgba(211,84,0,0.15)",
          }}
        >
          <Plus className="size-4" />
          Thêm nhà cung cấp
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            icon: <Users className="size-5" />,
            iconBg: "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
            iconColor: "var(--md-tertiary)",
            label: "Tổng đối tác",
            value: String(suppliers.length).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-5" />,
            iconBg: "var(--md-secondary-container)",
            iconColor: "var(--md-secondary)",
            label: "Đang hoạt động",
            value: String(active).padStart(2, "0"),
            valueColor: "var(--md-secondary)",
          },
          {
            icon: <Pause className="size-5" />,
            iconBg: "var(--md-surface-highest)",
            iconColor: "var(--md-on-surface-variant)",
            label: "Tạm ngưng",
            value: String(suspended).padStart(2, "0"),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-6 ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <div className="mb-4 flex items-start justify-between">
              <div
                className="flex size-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: card.iconBg,
                  color: card.iconColor,
                }}
              >
                {card.icon}
              </div>
              <span
                className="whitespace-nowrap text-label font-semibold uppercase tracking-wide"
                style={{ color: "var(--md-outline-variant)" }}
              >
                Hệ thống
              </span>
            </div>
            <h3
              className="text-3xl font-black tracking-tight"
              style={{ color: card.valueColor }}
            >
              {card.value}
            </h3>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Data Table */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
        }}
      >
        <Table>
          <TableHeader>
            <TableRow
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
              }}
            >
              {[
                "Nhà cung cấp",
                "Mã số thuế",
                "Điện thoại",
                "Địa chỉ",
                "Phân loại",
                "Trạng thái",
                "",
              ].map((h) => (
                <TableHead
                  key={h || "action"}
                  className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h === "Trạng thái" ? "text-center" : ""}`}
                  style={{ color: "var(--md-outline)" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s, i) => {
              const color = avatarColors[i % avatarColors.length]!;
              return (
                <TableRow
                  key={s.id}
                  className="group transition-colors"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-9 items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: color.bg,
                          color: color.fg,
                        }}
                      >
                        {s.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p
                          className="text-label"
                          style={{ color: "var(--md-outline)" }}
                        >
                          {s.code}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell
                    className="px-6 py-5 font-mono text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {s.taxId}
                  </TableCell>
                  <TableCell className="px-6 py-5 font-mono text-sm">
                    {s.phone}
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate px-6 py-5 text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {s.address}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: "var(--md-surface-high)",
                        color: "var(--md-on-surface-variant)",
                      }}
                    >
                      {s.category}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-center">
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <button
                      type="button"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--md-outline)" }}
                    >
                      <MoreVertical className="size-5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            Hiển thị {suppliers.length} nhà cung cấp
          </span>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: "var(--md-primary)" }}
            >
              1
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Clock, Filter } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge, SearchableSelect } from "../_components/shared";

export type StocktakeSessionRow = {
  id: number;
  code: string;
  branchName: string;
  manager: string;
  status: string;
  startDate: string;
  endDate: string | null;
  progress: number;
  counted: number;
  total: number;
};

export function StocktakeClient({
  sessions,
}: {
  sessions: StocktakeSessionRow[];
}) {
  const [status, setStatus] = useState("all");
  const [branch, setBranch] = useState("all");
  const active = sessions.filter((s) => s.status === "in_progress").length;
  return (
    <div className="space-y-6">
      {/* Page Header with inline stat badges */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Phiếu Kiểm kê
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.8 }}
          >
            Quản lý và theo dõi các đợt kiểm kê hàng hóa định kỳ.
          </p>
        </div>
        <div className="flex gap-3">
          {/* Inline stat badges */}
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-2"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <div
              className="flex size-10 items-center justify-center rounded-lg"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-tertiary) 10%, transparent)",
              }}
            >
              <Clock
                className="size-5"
                style={{ color: "var(--md-tertiary)" }}
              />
            </div>
            <div>
              <p
                className="whitespace-nowrap text-label font-semibold uppercase tracking-wide"
                style={{ color: "var(--md-outline)" }}
              >
                Đang thực hiện
              </p>
              <p className="text-lg font-bold leading-none">
                {String(active).padStart(2, "0")}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-2"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <div
              className="flex size-10 items-center justify-center rounded-lg"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-secondary) 10%, transparent)",
              }}
            >
              <CheckCircle
                className="size-5"
                style={{ color: "var(--md-secondary)" }}
              />
            </div>
            <div>
              <p
                className="whitespace-nowrap text-label font-semibold uppercase tracking-wide"
                style={{ color: "var(--md-outline)" }}
              >
                Đã hoàn thành
              </p>
              <p className="text-lg font-bold leading-none">128</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 ambient-shadow"
        style={{ backgroundColor: "var(--md-surface-lowest)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 rounded-lg border-b-2 px-3 py-1.5"
            style={{
              backgroundColor: "var(--md-surface-low)",
              borderColor:
                "color-mix(in srgb, var(--md-primary) 20%, transparent)",
            }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-tight"
              style={{ color: "var(--md-outline)" }}
            >
              Trạng thái
            </span>
            <SearchableSelect
              options={[
                { value: "all", label: "Tất cả" },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
              ]}
              value={status}
              onValueChange={setStatus}
              placeholder="Tất cả"
              searchPlaceholder="Tìm trạng thái..."
              variant="ghost"
            />
          </div>
          <div
            className="flex items-center gap-2 rounded-lg border-b-2 px-3 py-1.5"
            style={{
              backgroundColor: "var(--md-surface-low)",
              borderColor:
                "color-mix(in srgb, var(--md-primary) 20%, transparent)",
            }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-tight"
              style={{ color: "var(--md-outline)" }}
            >
              Chi nhánh
            </span>
            <SearchableSelect
              options={[
                { value: "all", label: "Tất cả chi nhánh" },
                { value: "q1", label: "CN Quận 1" },
                { value: "q3", label: "CN Quận 3" },
                { value: "bt", label: "CN Bình Thạnh" },
              ]}
              value={branch}
              onValueChange={setBranch}
              placeholder="Tất cả chi nhánh"
              searchPlaceholder="Tìm chi nhánh..."
              variant="ghost"
            />
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors"
          style={{ color: "var(--md-primary)" }}
        >
          <Filter className="size-4" />
          Lọc nâng cao
        </button>
      </div>

      {/* Data Table */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{ backgroundColor: "var(--md-surface-lowest)" }}
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
                "Mã phiên",
                "Chi nhánh",
                "Trạng thái",
                "Bắt đầu",
                "Hoàn thành",
                "Tiến độ",
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
            {sessions.map((s) => (
              <TableRow
                key={s.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
                }}
              >
                <TableCell className="px-6 py-5">
                  <Link
                    href={`/inventory/stocktake/${s.code}`}
                    className="font-mono text-sm font-bold hover:underline"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {s.code}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {s.branchName}
                    </span>
                    <span
                      className="text-label"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Quản lý: {s.manager}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5 text-center">
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <span className="text-sm tabular-nums">{s.startDate}</span>
                </TableCell>
                <TableCell className="px-6 py-5">
                  {s.endDate ? (
                    <span className="text-sm tabular-nums">{s.endDate}</span>
                  ) : (
                    <span
                      className="text-sm italic"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Dự kiến: 18:00
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-col-sm px-6 py-5">
                  <div className="flex flex-col gap-1">
                    <div
                      className="flex justify-between text-label font-semibold"
                      style={{ color: "var(--md-outline)" }}
                    >
                      <span>{s.progress}%</span>
                      <span>
                        {s.counted}/{s.total} items
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--md-surface-high)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${s.progress}%`,
                          backgroundColor:
                            s.progress === 100
                              ? "var(--md-secondary)"
                              : "var(--md-tertiary)",
                        }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <button
                    type="button"
                    className="rounded-lg p-2 opacity-0 transition-all group-hover:opacity-100"
                    style={{ color: "var(--md-primary)" }}
                  >
                    <ArrowRight className="size-5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing inventory issue surface keeps localized JSX copy until message-catalog extraction */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ArrowRight as IconArrowRight,
  FileDown as IconFileDownload,
  FilterX as IconFilterX,
  EllipsisVertical as IconDotsVertical,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { getInventoryStatusLabel } from "../_lib/ui";
import { tNav } from "../_lib/dictionary";
import { createStockIssueDraft } from "../issue-actions";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
export type IssueRow = {
  id: number;
  code: string;
  type: string;
  branchName: string;
  branchKind: string | null;
  date: string;
  createdBy: string;
  status: string;
};

export type IssueBranchOption = {
  id: number;
  name: string;
  branchKind: string | null;
};

export type RecordedConsumptionRow = {
  id: number;
  recordedAt: string;
  branchName: string;
  locationName: string;
  ingredientName: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
};

const ISSUE_TYPES = [
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
] as const;

function issueTypeLabel(type: string, branchKind: string | null): string {
  void branchKind;
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? type;
}

const STATE_FILTER_OPTIONS = ["draft", "confirmed", "cancelled"].map(
  (value) => ({
    value,
    label: getInventoryStatusLabel(value),
  }),
);

// Filter options show generic labels (no branch context at the filter level).
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả loại xuất" },
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
];

const CREATE_ISSUE_DIALOG_DESCRIPTION =
  "Chọn điểm vận hành, loại xuất và ghi chú trước khi tạo phiếu nháp.";

const createIssueSchema = z.object({
  branchId: z.string().min(1, { error: "Chọn chi nhánh để tạo phiếu xuất." }),
  issueType: z.enum(["consumption", "writeoff", "other"]),
  notes: z.string().trim().optional(),
});

type CreateIssueValues = z.infer<typeof createIssueSchema>;

function csvCell(value: string | number): string {
  const raw = String(value);
  // Prevent spreadsheet formula injection on cells starting with =, +, -, @, tab, CR.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function toUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function IssuesClient({
  issues,
  recordedConsumptions,
  branches,
  defaultBranchId,
}: {
  issues: IssueRow[];
  recordedConsumptions: RecordedConsumptionRow[];
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
}) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createIssueDefaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: "consumption",
      notes: "",
    }),
    [defaultBranchId],
  );
  // Capability-gated only — the CSV builds client-side and downloads fine
  // on phones; hiding it by breakpoint forced warehouse staff back to a
  // desktop just to press one button.
  const showExportAction = true;

  const filtered = useMemo(() => {
    let result = issues;
    if (activeStatus !== "all") {
      result = result.filter((i) => i.status === activeStatus);
    }
    if (activeType !== "all") {
      result = result.filter((i) => i.type === activeType);
    }
    const q = search.trim();
    if (q) {
      result = result.filter((i) => matchesSearch([i.code, i.branchName], q));
    }
    return result;
  }, [activeStatus, activeType, search, issues]);

  async function handleCreate(values: CreateIssueValues) {
    const res = await createStockIssueDraft({
      branchId: Number(values.branchId),
      issueType: values.issueType,
      notes: values.notes?.trim() || undefined,
    });

    if (res.success && res.data) {
      const newId = (res.data as { id: number }).id;
      router.push(`/inventory/consumption/${newId}`);
    }

    return res;
  }

  const hasActiveFilters =
    activeStatus !== "all" || activeType !== "all" || search.trim().length > 0;

  function handleExportIssuesCsv() {
    if (filtered.length === 0) {
      toast.error("Không có dữ liệu để xuất báo cáo.");
      return;
    }

    const header = [
      "Mã phiếu",
      "Loại xuất",
      "Chi nhánh",
      "Ngày tạo",
      "Trạng thái",
    ];
    const rows = filtered.map((row) => [
      row.code,
      issueTypeLabel(row.type, row.branchKind),
      row.branchName,
      row.date,
      row.status,
    ]);

    const body = [header, ...rows]
      .map((line) => line.map((cell) => csvCell(cell)).join(","))
      .join("\n");
    // BOM so Excel renders Vietnamese characters correctly on Windows.
    const csv = `\uFEFF${body}`;
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-")
      .replace("T", "-");

    downloadCsv(toUtf8Base64(csv), `phieu-xuat-kho-${stamp}.csv`);
    toast.success(`Đã xuất ${String(filtered.length)} phiếu xuất.`);
  }

  const filterBar = (
    <AppToolbar variant="inline">
      <div className="flex flex-1 flex-wrap items-end gap-3">
        <Select value={activeStatus} onValueChange={setActiveStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {STATE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeType} onValueChange={setActiveType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tất cả loại xuất" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <InputGroup className="h-12 flex-1 basis-full sm:h-10 sm:basis-auto">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã phiếu, chi nhánh..."
            inputMode="search"
          />
        </InputGroup>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="rounded-full">
          {filtered.length}/{issues.length}
        </Badge>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveStatus("all");
              setActiveType("all");
              setSearch("");
            }}
          >
            <IconFilterX className="mr-1 size-4" />
            Xóa lọc
          </Button>
        )}
      </div>
    </AppToolbar>
  );

  const issueColumns: DataTableColumn<IssueRow>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      render: (item) => (
        <Link
          href={`/inventory/consumption/${item.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {item.code}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Loại xuất",
      render: (item) => (
        <span className="text-sm font-medium">
          {issueTypeLabel(item.type, item.branchKind)}
        </span>
      ),
    },
    {
      key: "branchName",
      header: BRANCH_VI.long,
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.branchName}</span>
      ),
    },
    {
      key: "date",
      header: "Ngày tạo",
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.date}</span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (item) => (
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/inventory/consumption/${item.id}`}>
            <IconDotsVertical className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const recordedConsumptionColumns: DataTableColumn<RecordedConsumptionRow>[] =
    [
      {
        key: "recordedAt",
        header: "Thời điểm",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.recordedAt}
          </span>
        ),
      },
      {
        key: "ingredientName",
        header: "Nguyên liệu",
        render: (item) => (
          <span className="text-sm font-medium">{item.ingredientName}</span>
        ),
      },
      {
        key: "branchName",
        header: BRANCH_VI.long,
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.branchName}
          </span>
        ),
      },
      {
        key: "locationName",
        header: "Kho trừ",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.locationName}
          </span>
        ),
      },
      {
        key: "quantity",
        header: FORM_VI.quantity,
        render: (item) => (
          <span className="font-mono text-sm">{item.quantity}</span>
        ),
      },
      {
        key: "unitCost",
        header: "Giá vốn",
        render: (item) => (
          <span className="font-mono text-sm">{item.unitCost}</span>
        ),
      },
      {
        key: "totalCost",
        header: "Thành tiền",
        className: "text-right",
        render: (item) => (
          <span className="font-mono text-sm font-medium">
            {item.totalCost}
          </span>
        ),
      },
    ];

  const renderIssueCard = (item: IssueRow) => (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={`/inventory/consumption/${item.id}`} className="block">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{item.code}</span>
            <StatusBadge status={item.status} size="sm" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {item.branchName}
          </p>
          <p className="text-xs text-muted-foreground">
            {issueTypeLabel(item.type, item.branchKind)} &middot; {item.date}
          </p>
        </div>
        <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );

  const renderRecordedConsumptionCard = (item: RecordedConsumptionRow) => (
    <InteractiveCard minHeight="tap" padding="compact">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {item.ingredientName}
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold">
            {item.totalCost}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {item.branchName} · {item.locationName}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} · {item.recordedAt}
        </p>
      </div>
    </InteractiveCard>
  );

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={tNav("consumption", "navigation")}
        actions={
          <>
            {showExportAction && (
              <Button
                type="button"
                variant="outline"
                onClick={handleExportIssuesCsv}
              >
                <IconFileDownload className="size-4" />
                Xuất báo cáo
              </Button>
            )}
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <IconPlus className="size-4" />
              Tạo phiếu
            </Button>
          </>
        }
      />

      <AppSection
        title="Tiêu hao đã ghi nhận"
        headerHint={`${recordedConsumptions.length} dòng gần nhất`}
        contentFlush
      >
        <DataTable
          columns={recordedConsumptionColumns}
          data={recordedConsumptions}
          getRowKey={(item) => item.id}
          emptyTitle="Chưa có tiêu hao đã ghi nhận"
          emptyDescription="Các báo cáo tiêu hao đã duyệt sẽ xuất hiện ở đây sau khi trừ kho."
          emptyMode="no-data"
          mobileCardRender={renderRecordedConsumptionCard}
        />
      </AppSection>

      <AppSection title="Phiếu tiêu hao" contentFlush>
        {filterBar}
        <DataTable
          columns={issueColumns}
          data={filtered}
          getRowKey={(item) => item.id}
          emptyTitle={
            hasActiveFilters
              ? "Không tìm thấy phiếu xuất phù hợp"
              : "Chưa có phiếu xuất kho nào"
          }
          emptyDescription="Điều chỉnh bộ lọc hoặc tạo phiếu xuất mới để bắt đầu."
          emptyMode={hasActiveFilters ? "no-results" : "no-data"}
          mobileCardRender={renderIssueCard}
        />
      </AppSection>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo phiếu"
        description={CREATE_ISSUE_DIALOG_DESCRIPTION}
        schema={createIssueSchema}
        defaultValues={createIssueDefaultValues}
        entityKey={defaultBranchId ?? "new-issue"}
        onSubmit={handleCreate}
        successMessage="Đã tạo phiếu xuất."
        submitLabel="Tạo phiếu"
        cancelLabel={ACTIONS_VI.cancel}
      >
        {(form) => {
          const selectedBranchId = form.watch("branchId");
          const selectedKind =
            branches.find((branch) => branch.id === Number(selectedBranchId))
              ?.branchKind ?? null;
          return (
            <>
              <SelectField
                control={form.control}
                name="branchId"
                label={BRANCH_VI.long}
                placeholder={BRANCH_VI.select}
                options={branches.map((branch) => ({
                  value: String(branch.id),
                  label: branch.name,
                }))}
                required
              />
              <SelectField
                control={form.control}
                name="issueType"
                label="Loại xuất"
                options={ISSUE_TYPES.map((option) => ({
                  value: option.value,
                  label:
                    option.value === "consumption"
                      ? issueTypeLabel("consumption", selectedKind)
                      : option.label,
                }))}
                required
              />
              <TextareaField
                control={form.control}
                name="notes"
                label={FORM_VI.notes}
                rows={3}
                placeholder="Nhập ghi chú cho phiếu xuất"
              />
            </>
          );
        }}
      </FormDialog>
    </AppPage>
  );
}

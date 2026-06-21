"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ACTIONS_VI, BRANCH_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { createExpiryWriteoff } from "../waste-actions";
import { fetchExpiryAlerts } from "../alert-actions";
import { PhotoUploadInput } from "../_components/photo-upload-input";
import type { BranchOption, ExpiryAlertRow } from "../page";

interface WriteOffTarget {
  alert: ExpiryAlertRow;
  quantity: string;
  photoUrl: string | null;
}

type ExpiryDisplayRow = ExpiryAlertRow & { rowKey: string };

const URGENCY_META: Record<string, { label: string; className: string }> = {
  expired: {
    label: "Đã hết hạn",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  critical: {
    label: "Nguy cấp",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  warning: {
    label: "Sắp hết hạn",
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

function ExpiryAlertCard({
  alert,
  disabled,
  onWriteOff,
}: {
  alert: ExpiryAlertRow;
  disabled: boolean;
  onWriteOff: (alert: ExpiryAlertRow) => void;
}) {
  const meta = URGENCY_META[alert.urgency] ?? {
    label: alert.urgency,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Item size="sm" className="justify-between border bg-muted/30">
      <ItemContent>
        <ItemTitle className="text-sm font-medium">
          <span className="truncate">{alert.ingredient_name}</span>
          <Badge className={cn("text-xs shrink-0", meta.className)}>
            {alert.urgency === "expired"
              ? "Đã hết hạn"
              : `${alert.days_remaining} ngày`}
          </Badge>
        </ItemTitle>
        <ItemDescription className="truncate">
          Lô: {alert.batch_number ?? "—"} · GRN: {alert.grn_number} ·{" "}
          {alert.branch_name} · {formatVNDate(alert.expiry_date)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 gap-1.5 text-xs shrink-0"
          onClick={() => onWriteOff(alert)}
          disabled={disabled}
        >
          <IconTrash className="size-3.5" />
          Xóa sổ
        </Button>
      </ItemActions>
    </Item>
  );
}

export function ExpiryListClient({
  initial,
  branches,
  tenantId,
  userRole,
  userBranchId,
}: {
  initial: ExpiryAlertRow[];
  branches: BranchOption[];
  tenantId: number;
  userRole: StaffRole;
  userBranchId: number | null;
}) {
  const [alerts, setAlerts] = useState(initial);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(
    userRole === "branch_manager" && userBranchId != null
      ? String(userBranchId)
      : "all",
  );
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);

  const isBranchLocked = userRole === "branch_manager" && userBranchId != null;

  const filtered = useMemo(() => {
    let items = alerts;

    if (branchFilter !== "all") {
      const bid = Number(branchFilter);
      items = items.filter((a) => a.branch_id === bid);
    }

    const q = search.trim();
    if (q) {
      items = items.filter((a) =>
        matchesSearch(
          [a.ingredient_name, a.batch_number, a.grn_number, a.branch_name],
          q,
        ),
      );
    }

    return items;
  }, [alerts, branchFilter, search]);

  const urgencyCounts = useMemo(() => {
    const counts = { expired: 0, critical: 0, warning: 0 };
    for (const a of filtered) {
      if (a.urgency === "expired") counts.expired++;
      else if (a.urgency === "critical") counts.critical++;
      else if (a.urgency === "warning") counts.warning++;
    }
    return counts;
  }, [filtered]);

  const displayItems = useMemo(() => {
    if (!urgencyFilter) return filtered;
    return filtered.filter((a) => a.urgency === urgencyFilter);
  }, [filtered, urgencyFilter]);

  const expired = useMemo(
    () => filtered.filter((a) => a.urgency === "expired"),
    [filtered],
  );
  const nearExpiry = useMemo(
    () =>
      filtered.filter(
        (a) => a.urgency === "critical" || a.urgency === "warning",
      ),
    [filtered],
  );

  function openWriteOff(alert: ExpiryAlertRow) {
    setWriteOff({ alert, quantity: "", photoUrl: null });
  }

  function handleConfirmWriteOff() {
    if (!writeOff) return;
    const qty = Number(writeOff.quantity);
    if (!qty || qty <= 0) {
      toast.error("Nhập số lượng hợp lệ");
      return;
    }

    const { alert, photoUrl } = writeOff;
    const lotPart = alert.batch_number ? ` lô ${alert.batch_number}` : "";
    const grnPart = alert.grn_number ? ` (GRN ${alert.grn_number})` : "";
    const expiryPart = alert.expiry_date ? ` HSD ${alert.expiry_date}` : "";
    startTransition(async () => {
      const res = await createExpiryWriteoff({
        branchId: alert.branch_id,
        ingredientId: alert.ingredient_id,
        quantity: qty,
        unit: alert.unit,
        grnItemId: alert.grn_item_id,
        note: `Hết hạn sử dụng — ${alert.ingredient_name}${lotPart}${expiryPart}${grnPart}`,
        photoUrls: photoUrl ? [photoUrl] : undefined,
      });

      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa sổ.");
        return;
      }

      if (res.data?.requiresApproval) {
        toast.success(
          `Đã gửi yêu cầu xóa sổ ${alert.ingredient_name} — chờ QLV duyệt`,
        );
      } else {
        toast.success(`Đã xóa sổ ${qty} ${alert.unit} ${alert.ingredient_name}`);
      }
      setWriteOff(null);

      const again = await fetchExpiryAlerts(
        branchFilter !== "all" ? Number(branchFilter) : undefined,
      );
      if (again.success) {
        setAlerts((again.data ?? []) as ExpiryAlertRow[]);
      }
    });
  }

  const columns: DataTableColumn<ExpiryDisplayRow>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      className: "text-sm font-medium",
      render: (alert) => alert.ingredient_name,
    },
    {
      key: "batch",
      header: "Lô hàng",
      className: "font-mono text-sm",
      render: (alert) => alert.batch_number ?? "—",
    },
    {
      key: "expiry",
      header: "Ngày hết hạn",
      className: "text-sm font-mono tabular-nums text-muted-foreground",
      render: (alert) => formatVNDate(alert.expiry_date),
    },
    {
      key: "remaining",
      header: "Còn lại",
      render: (alert) =>
        alert.urgency === "expired" ? (
          <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
            Đã hết hạn
          </Badge>
        ) : (
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              alert.urgency === "critical"
                ? "text-destructive"
                : "text-warning",
            )}
          >
            {alert.days_remaining} ngày
          </span>
        ),
    },
    {
      key: "grn",
      header: "Phiếu nhập",
      className: "font-mono text-sm",
      render: (alert) => alert.grn_number,
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-sm",
      render: (alert) => alert.branch_name,
    },
    {
      key: "actions",
      header: "Hành động",
      render: (alert) => (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => openWriteOff(alert)}
          disabled={isPending}
        >
          <IconTrash className="size-3.5" />
          Xóa sổ
        </Button>
      ),
    },
  ];

  function renderTable(items: ExpiryAlertRow[]) {
    const rows: ExpiryDisplayRow[] = items.map((alert, idx) => ({
      ...alert,
      rowKey: `${alert.ingredient_id}-${alert.grn_number}-${alert.batch_number ?? ""}-${String(idx)}`,
    }));
    return (
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.rowKey}
        emptyTitle="Không có hàng sắp hết hạn"
        emptyDescription="Tất cả nguyên liệu còn trong hạn sử dụng"
        emptyIcon={<IconCircleCheck />}
        mobileCardRender={(row) => (
          <ExpiryAlertCard
            alert={row}
            disabled={isPending}
            onWriteOff={openWriteOff}
          />
        )}
      />
    );
  }

  return (
    <AppPage>
      <AppPageHeader eyebrow="Kho hàng" title="Hạn sử dụng" />
      {/* IconSearch + branch filter */}
      <AppToolbar>
        <InputGroup className="h-10 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Tìm nguyên liệu, lô hàng, phiếu nhập..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        {!isBranchLocked && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="outline" className="rounded-full">
          {displayItems.length} mục
        </Badge>
      </AppToolbar>

      {/* Urgency filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            setUrgencyFilter((prev) => (prev === "expired" ? null : "expired"))
          }
          className={cn(
            "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
            urgencyFilter === "expired"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          Đã hết hạn
          <span className="font-mono tabular-nums">
            {urgencyCounts.expired}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            setUrgencyFilter((prev) =>
              prev === "critical" ? null : "critical",
            )
          }
          className={cn(
            "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
            urgencyFilter === "critical"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          Nguy cấp
          <span className="font-mono tabular-nums">
            {urgencyCounts.critical}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            setUrgencyFilter((prev) => (prev === "warning" ? null : "warning"))
          }
          className={cn(
            "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
            urgencyFilter === "warning"
              ? "bg-warning/10 text-warning border-warning/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          Sắp hết hạn
          <span className="font-mono tabular-nums">
            {urgencyCounts.warning}
          </span>
        </Button>
        {urgencyFilter && (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setUrgencyFilter(null)}
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Tất cả ({displayItems.length})</TabsTrigger>
          <TabsTrigger value="expired">
            Đã hết hạn (
            {urgencyFilter
              ? displayItems.filter((a) => a.urgency === "expired").length
              : expired.length}
            )
          </TabsTrigger>
          <TabsTrigger value="near">
            Sắp hết hạn (
            {urgencyFilter
              ? displayItems.filter(
                  (a) => a.urgency === "critical" || a.urgency === "warning",
                ).length
              : nearExpiry.length}
            )
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {renderTable(displayItems)}
        </TabsContent>
        <TabsContent value="expired">
          {renderTable(
            urgencyFilter
              ? displayItems.filter((a) => a.urgency === "expired")
              : expired,
          )}
        </TabsContent>
        <TabsContent value="near">
          {renderTable(
            urgencyFilter
              ? displayItems.filter(
                  (a) => a.urgency === "critical" || a.urgency === "warning",
                )
              : nearExpiry,
          )}
        </TabsContent>
      </Tabs>
      {/* Write-off AlertDialog */}
      <AlertDialog
        open={writeOff != null}
        onOpenChange={(open) => {
          if (!open) setWriteOff(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sổ</AlertDialogTitle>
            <AlertDialogDescription>
              {writeOff
                ? `Xóa sổ ${writeOff.alert.ingredient_name} — lô ${writeOff.alert.batch_number ?? "không có mã lô"}. Hành động này sẽ trừ tồn kho.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <Label htmlFor="writeoff-qty">Số lượng xóa sổ</Label>
            <FormattedNumberInput
              id="writeoff-qty"
              placeholder="Nhập số lượng..."
              value={writeOff?.quantity ?? ""}
              onValueChange={(value) =>
                setWriteOff((prev) =>
                  prev ? { ...prev, quantity: value } : null,
                )
              }
              maxFractionDigits={3}
            />
            <div className="flex flex-col gap-1.5">
              <Label>Ảnh bằng chứng</Label>
              <PhotoUploadInput
                tenantId={tenantId}
                folder={`waste/expiry-${writeOff?.alert.grn_item_id ?? "new"}`}
                value={writeOff?.photoUrl ?? null}
                onChange={(url) =>
                  setWriteOff((prev) =>
                    prev ? { ...prev, photoUrl: url } : null,
                  )
                }
                acceptTypes="image"
                allowPaste={false}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Bắt buộc nếu giá trị xóa sổ vượt ngưỡng (tier ≥ 1).
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {ACTIONS_VI.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmWriteOff}
              disabled={
                isPending ||
                !writeOff?.quantity ||
                Number(writeOff.quantity) <= 0
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Đang xử lý..." : "Xóa sổ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPage>
  );
}

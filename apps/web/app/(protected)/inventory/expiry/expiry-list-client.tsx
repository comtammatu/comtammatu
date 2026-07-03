"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import {
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
  TOAST_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { FormDialog, NumberField } from "@/components/form";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { createExpiryWriteoff } from "../waste-actions";
import { fetchExpiryAlerts } from "../alert-actions";
import { PhotoUploadInput } from "../_components/photo-upload-input";
import type { BranchOption, ExpiryAlertRow } from "../page";

type ExpiryDisplayRow = ExpiryAlertRow & { rowKey: string };

const writeOffSchema = z.object({
  quantity: z
    .string()
    .trim()
    .min(1, { error: TOAST_VI.enterValidQuantity })
    .refine((value) => Number(value) > 0, {
      error: TOAST_VI.enterValidQuantity,
    }),
  photoUrl: z.string().optional(),
});

type WriteOffFormValues = z.infer<typeof writeOffSchema>;

const WRITE_OFF_DEFAULT_VALUES: WriteOffFormValues = {
  quantity: "",
  photoUrl: "",
};

const URGENCY_META: Record<string, { label: string; className: string }> = {
  expired: {
    label: INVENTORY_VI.expired,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  critical: {
    label: INVENTORY_VI.critical,
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  warning: {
    label: INVENTORY_VI.warning,
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

function ExpiryAlertCard({
  alert,
  disabled,
  onWriteOff,
  embedded = false,
}: {
  alert: ExpiryAlertRow;
  disabled: boolean;
  onWriteOff: (alert: ExpiryAlertRow) => void;
  embedded?: boolean;
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
              ? INVENTORY_VI.expired
              : `${alert.days_remaining} ${INVENTORY_VI.daySuffix}`}
          </Badge>
        </ItemTitle>
        <ItemDescription className="truncate">
          {INVENTORY_VI.batchShort}: {alert.batch_number ?? "—"} · GRN:{" "}
          {alert.grn_number} · {alert.branch_name} ·{" "}
          {formatVNDate(alert.expiry_date)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="destructive"
          size={embedded ? "touch" : "sm"}
          className={embedded ? "shrink-0" : "h-7 gap-1.5 text-xs shrink-0"}
          onClick={() => onWriteOff(alert)}
          disabled={disabled}
        >
          <IconTrash className="size-3.5" />
          {INVENTORY_VI.writeOff}
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
  embedded = false,
  headingLevel = "h1",
}: {
  initial: ExpiryAlertRow[];
  branches: BranchOption[];
  tenantId: number;
  userRole: StaffRole;
  userBranchId: number | null;
  embedded?: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const [alerts, setAlerts] = useState(initial);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(
    userRole === "branch_manager" && userBranchId != null
      ? String(userBranchId)
      : "all",
  );
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [writeOff, setWriteOff] = useState<ExpiryAlertRow | null>(null);

  const isBranchLocked =
    embedded || (userRole === "branch_manager" && userBranchId != null);

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
    setWriteOff(alert);
  }

  async function handleConfirmWriteOff(values: WriteOffFormValues) {
    if (!writeOff) return { success: false, error: TOAST_VI.writeOffFailed };
    const qty = Number(values.quantity);
    const alert = writeOff;
    const lotPart = alert.batch_number ? ` lô ${alert.batch_number}` : "";
    const grnPart = alert.grn_number ? ` (GRN ${alert.grn_number})` : "";
    const expiryPart = alert.expiry_date ? ` HSD ${alert.expiry_date}` : "";

    const res = await createExpiryWriteoff({
      branchId: alert.branch_id,
      ingredientId: alert.ingredient_id,
      quantity: qty,
      unit: alert.unit,
      grnItemId: alert.grn_item_id,
      note: `Hết hạn sử dụng — ${alert.ingredient_name}${lotPart}${expiryPart}${grnPart}`,
      photoUrls: values.photoUrl ? [values.photoUrl] : undefined,
    });

    if (!res.success) return res;

    if (res.data?.requiresApproval) {
      toast.success(
        `Đã gửi yêu cầu xóa sổ ${alert.ingredient_name} — chờ QLV duyệt`,
      );
    } else {
      toast.success(`Đã xóa sổ ${qty} ${alert.unit} ${alert.ingredient_name}`);
    }

    const again = await fetchExpiryAlerts(
      branchFilter !== "all" ? Number(branchFilter) : undefined,
    );
    if (again.success) {
      setAlerts((again.data ?? []) as ExpiryAlertRow[]);
    }

    return res;
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
      header: INVENTORY_VI.batchNumber,
      className: "font-mono text-sm",
      render: (alert) => alert.batch_number ?? "—",
    },
    {
      key: "expiry",
      header: INVENTORY_VI.expiryDate,
      className: "text-sm font-mono tabular-nums text-muted-foreground",
      render: (alert) => formatVNDate(alert.expiry_date),
    },
    {
      key: "remaining",
      header: INVENTORY_VI.remaining,
      render: (alert) =>
        alert.urgency === "expired" ? (
          <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
            {INVENTORY_VI.expired}
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
            {alert.days_remaining} {INVENTORY_VI.daySuffix}
          </span>
        ),
    },
    {
      key: "grn",
      header: INVENTORY_VI.grnDoc,
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
      header: FORM_VI.actionColumn,
      render: (alert) => (
        <Button
          variant="destructive"
          size={embedded ? "touch" : "sm"}
          className={embedded ? undefined : "h-7 gap-1.5 text-xs"}
          onClick={() => openWriteOff(alert)}
          disabled={writeOff != null}
        >
          <IconTrash className="size-3.5" />
          {INVENTORY_VI.writeOff}
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
        emptyTitle={INVENTORY_VI.expiryEmptyTitle}
        emptyDescription={INVENTORY_VI.expiryEmptyDescription}
        emptyIcon={<IconCircleCheck />}
        mobileCardRender={(row) => (
          <ExpiryAlertCard
            alert={row}
            disabled={writeOff != null}
            onWriteOff={openWriteOff}
            embedded={embedded}
          />
        )}
      />
    );
  }

  const content = (
    <>
      <AppPageHeader
        headingLevel={headingLevel}
        eyebrow={INVENTORY_VI.warehouse}
        title={INVENTORY_VI.expiryTitle}
      />
      {/* IconSearch + branch filter */}
      <AppToolbar>
        <InputGroup className="h-10 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={INVENTORY_VI.expirySearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        {!isBranchLocked && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={BRANCH_VI.long} />
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
          {displayItems.length} {INVENTORY_VI.itemSuffix}
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
            "h-auto gap-1.5 rounded-full px-3 font-medium",
            embedded ? "py-2.5" : "py-1",
            urgencyFilter === "expired"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          {INVENTORY_VI.expired}
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
            "h-auto gap-1.5 rounded-full px-3 font-medium",
            embedded ? "py-2.5" : "py-1",
            urgencyFilter === "critical"
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          {INVENTORY_VI.critical}
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
            "h-auto gap-1.5 rounded-full px-3 font-medium",
            embedded ? "py-2.5" : "py-1",
            urgencyFilter === "warning"
              ? "bg-warning/10 text-warning border-warning/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          {INVENTORY_VI.warning}
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
            {ACTIONS_VI.clearFilters}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            {INVENTORY_VI.allTab} ({displayItems.length})
          </TabsTrigger>
          <TabsTrigger value="expired">
            {INVENTORY_VI.expired} (
            {urgencyFilter
              ? displayItems.filter((a) => a.urgency === "expired").length
              : expired.length}
            )
          </TabsTrigger>
          <TabsTrigger value="near">
            {INVENTORY_VI.warning} (
            {urgencyFilter
              ? displayItems.filter(
                  (a) => a.urgency === "critical" || a.urgency === "warning",
                ).length
              : nearExpiry.length}
            )
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">{renderTable(displayItems)}</TabsContent>
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
      <FormDialog
        open={writeOff != null}
        onOpenChange={(open) => {
          if (!open) setWriteOff(null);
        }}
        schema={writeOffSchema}
        defaultValues={WRITE_OFF_DEFAULT_VALUES}
        entityKey={writeOff?.grn_item_id ?? "writeoff"}
        title={INVENTORY_VI.writeOffConfirmTitle}
        description={
          writeOff
            ? `Xóa sổ ${writeOff.ingredient_name} — lô ${writeOff.batch_number ?? "không có mã lô"}. Hành động này sẽ trừ tồn kho.`
            : undefined
        }
        submitLabel={INVENTORY_VI.writeOff}
        submitVariant="destructive"
        cancelLabel={ACTIONS_VI.cancel}
        onSubmit={handleConfirmWriteOff}
      >
        {(form) => (
          <>
            <NumberField
              control={form.control}
              name="quantity"
              id="writeoff-qty"
              label={INVENTORY_VI.writeOffQty}
              placeholder={INVENTORY_VI.enterQuantityPlaceholder}
              maxFractionDigits={3}
              required
            />
            <div className="flex flex-col gap-1.5">
              <Label>{INVENTORY_VI.evidencePhoto}</Label>
              <PhotoUploadInput
                tenantId={tenantId}
                folder={`waste/expiry-${writeOff?.grn_item_id ?? "new"}`}
                value={form.watch("photoUrl") || null}
                onChange={(url) =>
                  form.setValue("photoUrl", url ?? "", { shouldDirty: true })
                }
                acceptTypes="image"
                allowPaste={false}
              />
              <p className="text-xs text-muted-foreground">
                {INVENTORY_VI.evidenceRequiredHint}
              </p>
            </div>
          </>
        )}
      </FormDialog>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage>{content}</AppPage>;
}

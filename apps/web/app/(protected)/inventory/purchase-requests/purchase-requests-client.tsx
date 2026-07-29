"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  formatVNDate,
  formatVNDateTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Combobox } from "@comtammatu/ui/components/combobox";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemHeader, ItemTitle } from "@comtammatu/ui/components/item";
import { Pagination } from "@comtammatu/ui/components/pagination";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppDialog,
  BusinessDatePicker,
  FormattedNumberInput,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  cancelPurchaseRequest,
  closePurchaseRequest,
  savePurchaseOrdersFromRequest,
  savePurchaseRequest,
} from "../purchase-order-actions";
import {
  buildPurchaseOrderDrafts,
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;
const PO_PAGE_SIZE = 3;
const comboFilter = (
  option: { label: string; keywords?: string[] },
  query: string,
) =>
  [option.label, ...(option.keywords ?? [])].some((value) =>
    value.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );

export type PurchaseRequestItemRow = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  orderedQuantity: number;
  remainingQuantity: number;
  entryUnitId: number;
  unitLabel: string;
  notes: string | null;
};

export type PurchaseRequestRow = {
  id: number;
  code: string;
  branchId: number;
  branchName: string;
  status: string;
  neededBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  orderedLineCount: number;
  items: PurchaseRequestItemRow[];
  purchaseOrders: Array<{
    id: number;
    code: string;
    status: string;
    supplierName: string;
  }>;
};

export type PurchaseRequestIngredientOption = {
  id: number;
  name: string;
  units: Array<{ id: number; label: string; factor: number }>;
};

type RequestDraftLine = {
  key: string;
  ingredientId: string;
  quantity: string;
  entryUnitId: string;
};

function statusVariant(status: string) {
  if (status === "ordered") return "success" as const;
  if (status === "partially_ordered" || status === "submitted") {
    return "warning" as const;
  }
  if (status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

function defaultUnit(ingredient?: PurchaseRequestIngredientOption) {
  return ingredient?.units.reduce<
    PurchaseRequestIngredientOption["units"][number] | undefined
  >(
    (selected, unit) =>
      selected == null || unit.factor > selected.factor ? unit : selected,
    undefined,
  );
}

function blankRequestLine(): RequestDraftLine {
  return {
    key: crypto.randomUUID(),
    ingredientId: "",
    quantity: "",
    entryUnitId: "",
  };
}

export function PurchaseRequestsClient({
  rows,
  branches,
  ingredients,
  suppliers,
  canCreateRequest,
  canCreatePo,
}: {
  rows: PurchaseRequestRow[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  suppliers: PurchaseOrderSupplier[];
  canCreateRequest: boolean;
  canCreatePo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState(String(branches[0]?.id ?? ""));
  const [neededBy, setNeededBy] = useState(() => getVNDateString());
  const [requestLines, setRequestLines] = useState<RequestDraftLine[]>([
    blankRequestLine(),
  ]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() =>
    getVNDateString(),
  );
  const [poDrafts, setPoDrafts] = useState<PurchaseOrderDraft[]>([]);
  const [poPage, setPoPage] = useState(1);
  const [requestIdempotencyKey, setRequestIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [poIdempotencyKey, setPoIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [requestBaseline, setRequestBaseline] = useState("");
  const [poBaseline, setPoBaseline] = useState("");
  const [reason, setReason] = useState("");
  const [reasonAction, setReasonAction] = useState<
    { kind: "cancel" | "close"; row: PurchaseRequestRow } | undefined
  >();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const mode = searchParams.get("mode");
  const requestId = Number(searchParams.get("requestId"));
  const selectedId =
    Number.isInteger(requestId) && requestId > 0 ? requestId : null;
  const selected =
    selectedId == null
      ? null
      : (rows.find((row) => row.id === selectedId) ?? null);
  const createOpen = mode === "create" || mode === "edit";
  const poOpen = mode === "create-po" && selected != null;
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          [
            row.code,
            row.branchName,
            copy.statusLabel(row.status),
            ...row.items.map((item) => item.ingredientName),
          ],
          search,
        ),
      ),
    [rows, search],
  );

  function resetCreate() {
    setBranchId(String(branches[0]?.id ?? ""));
    setNeededBy(getVNDateString());
    setRequestLines([blankRequestLine()]);
    setRequestBaseline("");
  }

  function requestFormSnapshot(
    nextBranchId = branchId,
    nextNeededBy = neededBy,
    nextLines = requestLines,
  ) {
    return JSON.stringify([nextBranchId, nextNeededBy, nextLines]);
  }

  function poFormSnapshot(
    nextDate = expectedDeliveryDate,
    nextDrafts = poDrafts,
  ) {
    return JSON.stringify([nextDate, nextDrafts]);
  }

  function updateUrl(
    nextRequestId: number | null,
    nextMode: "view" | "edit" | "create" | "create-po" | null,
    method: "push" | "replace" = "push",
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextRequestId == null) params.delete("requestId");
    else params.set("requestId", String(nextRequestId));
    if (nextMode == null) params.delete("mode");
    else params.set("mode", nextMode);
    const href = params.size > 0 ? `${pathname}?${params}` : pathname;
    router[method](href, { scroll: false });
  }

  useEffect(() => {
    if (mode !== "edit" || !selected) return;
    const nextBranchId = String(selected.branchId);
    const nextNeededBy = selected.neededBy ?? getVNDateString();
    const nextLines = selected.items.map((item) => ({
      key: String(item.id),
      ingredientId: String(item.ingredientId),
      quantity: String(item.quantity),
      entryUnitId: String(item.entryUnitId),
    }));
    setBranchId(nextBranchId);
    setNeededBy(nextNeededBy);
    setRequestLines(nextLines);
    setRequestBaseline(JSON.stringify([nextBranchId, nextNeededBy, nextLines]));
  }, [mode, selected]);

  async function closeRequestForm() {
    if (
      requestBaseline &&
      requestFormSnapshot() !== requestBaseline &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    updateUrl(null, null, "replace");
    resetCreate();
  }

  async function closePoForm() {
    if (
      poBaseline &&
      poFormSnapshot() !== poBaseline &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    updateUrl(selected?.id ?? null, selected ? "view" : null, "replace");
  }

  function patchRequestLine(key: string, patch: Partial<RequestDraftLine>) {
    setRequestLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function chooseIngredient(line: RequestDraftLine, value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    patchRequestLine(line.key, {
      ingredientId: value,
      entryUnitId: String(defaultUnit(ingredient)?.id ?? ""),
    });
  }

  function saveRequest(submit: boolean) {
    const lines = requestLines.map((line) => ({
      ingredientId: Number(line.ingredientId),
      quantity: Number(line.quantity),
      entryUnitId: Number(line.entryUnitId),
    }));
    if (
      !Number(branchId) ||
      lines.some(
        (line) =>
          !line.ingredientId ||
          !line.entryUnitId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      toast.error(copy.createFailed);
      return;
    }
    startTransition(async () => {
      const result = await savePurchaseRequest({
        requestId: mode === "edit" ? selected?.id : null,
        branchId: Number(branchId),
        neededBy: neededBy || null,
        lines,
        submit,
        idempotencyKey:
          mode === "create" ? requestIdempotencyKey : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? copy.createFailed);
        return;
      }
      toast.success(submit ? copy.submitSuccess : copy.createSuccess);
      updateUrl(result.data.id, "view", "replace");
      setRequestIdempotencyKey(crypto.randomUUID());
      resetCreate();
      router.refresh();
    });
  }

  function openPo(row: PurchaseRequestRow) {
    setExpectedDeliveryDate(getVNDateString());
    const drafts = buildPurchaseOrderDrafts(row.items, suppliers);
    setPoDrafts(drafts);
    setPoPage(1);
    setPoBaseline(poFormSnapshot(getVNDateString(), drafts));
    updateUrl(row.id, "create-po");
  }

  function patchPoLine(
    supplierId: number,
    key: string,
    patch: Partial<PurchaseOrderDraftLine>,
  ) {
    setPoDrafts((current) =>
      current.map((draft) =>
        draft.supplierId === supplierId
          ? {
              ...draft,
              lines: draft.lines.map((line) =>
                line.key === key ? { ...line, ...patch } : line,
              ),
            }
          : draft,
      ),
    );
  }

  function splitPoLine(supplierId: number, line: PurchaseOrderDraftLine) {
    setPoDrafts((current) =>
      current.map((draft) =>
        draft.supplierId === supplierId
          ? {
              ...draft,
              lines: [
                ...draft.lines,
                {
                  key: crypto.randomUUID(),
                  requestItemId: line.requestItemId,
                  quantity: "",
                  unitPrice: "0",
                },
              ],
            }
          : draft,
      ),
    );
  }

  function savePo(send: boolean) {
    if (!selected) return;
    const orders = poDrafts
      .map((draft) => ({
        supplierId: draft.supplierId,
        expectedDeliveryDate: expectedDeliveryDate || null,
        lines: draft.lines
          .filter((line) => line.quantity.trim() !== "")
          .map((line) => ({
            requestItemId: line.requestItemId,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          })),
      }))
      .filter((order) => order.lines.length > 0);
    const lines = orders.flatMap((order) => order.lines);
    const totals = new Map<number, number>();
    for (const line of lines) {
      totals.set(
        line.requestItemId,
        (totals.get(line.requestItemId) ?? 0) +
          Math.round(line.quantity * 1000),
      );
    }
    const invalid =
      orders.length === 0 ||
      lines.length === 0 ||
      lines.some(
        (line) =>
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !Number.isFinite(line.unitPrice) ||
          line.unitPrice < 0,
      ) ||
      selected.items.some(
        (item) =>
          item.remainingQuantity > 0 &&
          (totals.get(item.id) ?? 0) !==
            Math.round(item.remainingQuantity * 1000),
      );
    if (invalid) {
      toast.error(copy.createPoFailed);
      return;
    }

    startTransition(async () => {
      const result = await savePurchaseOrdersFromRequest({
        requestId: selected.id,
        orders,
        send,
        idempotencyKey: poIdempotencyKey,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.createPoFailed);
        return;
      }
      toast.success(copy.createPoSuccess(orders.length));
      setPoIdempotencyKey(crypto.randomUUID());
      updateUrl(selected.id, "view", "replace");
      router.refresh();
    });
  }

  function runReasonAction() {
    if (!reasonAction) return;
    setPendingId(reasonAction.row.id);
    startTransition(async () => {
      try {
        const result =
          reasonAction.kind === "cancel"
            ? await cancelPurchaseRequest({
                requestId: reasonAction.row.id,
                reason,
              })
            : await closePurchaseRequest({
                requestId: reasonAction.row.id,
                reason,
              });
        if (!result.success) {
          toast.error(result.error ?? copy.loadFailed);
          return;
        }
        setReasonAction(undefined);
        setReason("");
        updateUrl(null, null, "replace");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function rowActions(row: PurchaseRequestRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.view,
        onSelect: () => updateUrl(row.id, "view"),
      },
    ];
    if (
      canCreateRequest &&
      (row.status === "draft" || row.status === "submitted") &&
      row.purchaseOrders.length === 0
    ) {
      actions.push({
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil data-icon="inline-start" />,
        onSelect: () => updateUrl(row.id, "edit"),
      });
      actions.push({
        key: "cancel",
        label: ACTIONS_VI.cancel,
        icon: <IconTrash data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => setReasonAction({ kind: "cancel", row }),
      });
    }
    if (
      canCreatePo &&
      (row.status === "submitted" || row.status === "partially_ordered") &&
      row.items.some((item) => item.remainingQuantity > 0)
    ) {
      actions.push({
        key: "create-po",
        label: copy.createPoAction,
        icon: <IconShoppingCart data-icon="inline-start" />,
        onSelect: () => openPo(row),
      });
    }
    if (row.status === "partially_ordered" && canCreateRequest) {
      actions.push({
        key: "close",
        label: ACTIONS_VI.close,
        disabled: isPending || pendingId === row.id,
        onSelect: () => setReasonAction({ kind: "close", row }),
      });
    }
    return actions;
  }

  const columns: DataTableColumn<PurchaseRequestRow>[] = [
    {
      key: "code",
      header: copy.codeColumn,
      render: (row) => (
        <span className="font-mono font-medium">{row.code}</span>
      ),
    },
    {
      key: "branch",
      header: copy.branchColumn,
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: copy.statusColumn,
      render: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {copy.statusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "needed",
      header: copy.neededByColumn,
      render: (row) => (row.neededBy ? formatVNDate(row.neededBy) : "—"),
    },
    {
      key: "progress",
      header: copy.progressColumn,
      render: (row) =>
        copy.orderedProgress(row.orderedLineCount, row.lineCount),
    },
    {
      key: "updated",
      header: copy.updatedColumn,
      render: (row) => formatVNDateTime(row.updatedAt),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu items={rowActions(row)} label={row.code} />
        </div>
      ),
    },
  ];

  const toolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
        </InputGroup>
      }
      actions={
        canCreateRequest ? (
          <Button
            type="button"
            onClick={() => {
              const nextBranchId = String(branches[0]?.id ?? "");
              const nextNeededBy = getVNDateString();
              const nextLines = [blankRequestLine()];
              setBranchId(nextBranchId);
              setNeededBy(nextNeededBy);
              setRequestLines(nextLines);
              setRequestBaseline(
                requestFormSnapshot(
                  nextBranchId,
                  nextNeededBy,
                  nextLines,
                ),
              );
              updateUrl(null, "create");
            }}
          >
            <IconPlus data-icon="inline-start" />
            {copy.createAction}
          </Button>
        ) : null
      }
    />
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title={copy.title} description={copy.description} />
      <AppListFrame toolbar={toolbar}>
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          pageSize={50}
          onRowClick={(row) => updateUrl(row.id, "view")}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
          emptyIcon={
            <IconClipboardList className="size-8 text-muted-foreground" />
          }
          mobileCardRender={(row) => (
            <InteractiveCard
              minHeight="mobile"
              padding="default"
              className="w-full flex-col items-stretch gap-2 text-left"
              render={<button type="button" />}
              onClick={() => updateUrl(row.id, "view")}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{row.code}</span>
                <Badge variant={statusVariant(row.status)}>
                  {copy.statusLabel(row.status)}
                </Badge>
              </span>
              <span className="text-sm">{row.branchName}</span>
              <span className="text-xs text-muted-foreground">
                {copy.lineCount(row.lineCount)} ·{" "}
                {copy.orderedProgress(row.orderedLineCount, row.lineCount)}
              </span>
            </InteractiveCard>
          )}
        />
      </AppListFrame>

      <AppDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) void closeRequestForm();
        }}
        variant="document"
        title={mode === "edit" && selected ? selected.code : copy.createTitle}
        description={
          mode === "edit" && selected
            ? copy.statusLabel(selected.status)
            : copy.description
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void closeRequestForm()}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => saveRequest(false)}
            >
              {copy.saveDraft}
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => saveRequest(true)}
            >
              {copy.submitAction}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger
              size="field"
              className="w-full"
              aria-label={copy.branchRequired}
            >
              <SelectValue placeholder={copy.branchRequired} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BusinessDatePicker
            value={neededBy}
            onValueChange={setNeededBy}
            aria-label={copy.neededBy}
          />
        </div>
        <div className="flex flex-col gap-2">
          {requestLines.map((line) => {
            const ingredient = ingredients.find(
              (item) => item.id === Number(line.ingredientId),
            );
            return (
              <Item
                key={line.key}
                variant="outline"
                size="sm"
                className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_10rem_auto]"
              >
                <Combobox
                  filter={comboFilter}
                  size="field"
                  value={line.ingredientId}
                  onValueChange={(value) => chooseIngredient(line, value)}
                  options={ingredients.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  placeholder={copy.ingredient}
                  searchPlaceholder={copy.searchPlaceholder}
                />
                <FormattedNumberInput
                  controlSize="field"
                  value={line.quantity}
                  onValueChange={(value) =>
                    patchRequestLine(line.key, { quantity: value })
                  }
                  maxFractionDigits={3}
                  placeholder={copy.quantity}
                  aria-label={copy.quantity}
                />
                <Select
                  value={line.entryUnitId}
                  onValueChange={(value) =>
                    patchRequestLine(line.key, { entryUnitId: value })
                  }
                >
                  <SelectTrigger
                    size="field"
                    className="w-full"
                    aria-label={copy.unit}
                  >
                    <SelectValue placeholder={copy.unit} />
                  </SelectTrigger>
                  <SelectContent>
                    {(ingredient?.units ?? []).map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  disabled={requestLines.length === 1}
                  onClick={() =>
                    setRequestLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                  aria-label={ACTIONS_VI.delete}
                >
                  <IconTrash />
                </Button>
              </Item>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setRequestLines((current) => [...current, blankRequestLine()])
            }
          >
            <IconPlus data-icon="inline-start" />
            {copy.addLine}
          </Button>
        </div>
      </AppDialog>

      <AppDialog
        open={selected != null && mode === "view"}
        onOpenChange={(open) => {
          if (!open) updateUrl(null, null, "replace");
        }}
        variant="document"
        title={selected?.code ?? copy.title}
        description={selected?.branchName}
        footer={
          selected ? (
            <>
              {canCreateRequest &&
              (selected.status === "draft" ||
                selected.status === "submitted") &&
              selected.purchaseOrders.length === 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    setReasonAction({ kind: "cancel", row: selected })
                  }
                >
                  {ACTIONS_VI.cancel}
                </Button>
              ) : null}
              {canCreateRequest &&
              selected.status === "partially_ordered" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    setReasonAction({ kind: "close", row: selected })
                  }
                >
                  {ACTIONS_VI.close}
                </Button>
              ) : null}
              {canCreateRequest &&
              (selected.status === "draft" ||
                selected.status === "submitted") &&
              selected.purchaseOrders.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateUrl(selected.id, "edit", "replace")}
                >
                  {ACTIONS_VI.edit}
                </Button>
              ) : null}
              {canCreatePo &&
              (selected.status === "submitted" ||
                selected.status === "partially_ordered") &&
              selected.items.some((item) => item.remainingQuantity > 0) ? (
                <Button type="button" onClick={() => openPo(selected)}>
                  {copy.createPoAction}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => updateUrl(null, null, "replace")}
              >
                {ACTIONS_VI.close}
              </Button>
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <DescriptionList
              className="sm:grid sm:grid-cols-3 sm:gap-4"
              items={[
                {
                  term: copy.statusColumn,
                  description: copy.statusLabel(selected.status),
                },
                {
                  term: copy.neededBy,
                  description: selected.neededBy
                    ? formatVNDate(selected.neededBy)
                    : "—",
                },
                {
                  term: copy.progressColumn,
                  description: copy.orderedProgress(
                    selected.orderedLineCount,
                    selected.lineCount,
                  ),
                },
              ]}
            />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{copy.linesTitle}</p>
              {selected.items.map((item) => (
                <Item
                  key={item.id}
                  variant="outline"
                  size="sm"
                  className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span>{item.ingredientName}</span>
                  <span className="font-mono tabular-nums">
                    {item.orderedQuantity}/{item.quantity} {item.unitLabel}
                  </span>
                </Item>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{copy.purchaseOrdersTitle}</p>
              {selected.purchaseOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {copy.noPurchaseOrders}
                </p>
              ) : (
                selected.purchaseOrders.map((po) => (
                  <Button
                    key={po.id}
                    type="button"
                    variant="outline"
                    className="justify-between"
                    render={
                      <Link
                        href={`/inventory/purchase-orders?poId=${po.id}&mode=view`}
                      />
                    }
                  >
                    <span className="font-mono">{po.code}</span>
                    <span>{po.supplierName}</span>
                  </Button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={poOpen && selected != null}
        onOpenChange={(open) => {
          if (!open) void closePoForm();
        }}
        variant="document"
        title={copy.createPoTitle}
        description={selected?.code}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void closePoForm()}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || poDrafts.length === 0}
              onClick={() => savePo(false)}
            >
              {copy.saveDraft}
            </Button>
            <Button
              type="button"
              disabled={isPending || poDrafts.length === 0}
              onClick={() => savePo(true)}
            >
              {copy.createPoAction}
            </Button>
          </>
        }
      >
        {selected ? (
          <>
            <BusinessDatePicker
              value={expectedDeliveryDate}
              onValueChange={setExpectedDeliveryDate}
              aria-label={copy.expectedDeliveryDate}
            />
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {copy.supplierOrderCount(poDrafts.length)}
              </p>
              {poDrafts.length === 0 ? (
                <Item variant="muted" size="sm">
                  {copy.noSupplierMappings}
                </Item>
              ) : null}
              {poDrafts
                .slice((poPage - 1) * PO_PAGE_SIZE, poPage * PO_PAGE_SIZE)
                .map((draft) => (
                  <Item
                    key={draft.supplierId}
                    variant="outline"
                    size="sm"
                    className="items-stretch"
                  >
                    <ItemHeader>
                      <ItemTitle size="heading">{draft.supplierName}</ItemTitle>
                      <Badge variant="secondary">
                        {copy.lineCount(draft.lines.length)}
                      </Badge>
                    </ItemHeader>
                    <div className="flex basis-full flex-col gap-2">
                      {draft.lines.map((line) => {
                        const item = selected.items.find(
                          (candidate) => candidate.id === line.requestItemId,
                        );
                        return (
                          <div
                            key={line.key}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto_auto]"
                          >
                            <span className="self-center text-sm">
                              {item?.ingredientName}
                              <span className="block text-xs text-muted-foreground">
                                {item?.unitLabel}
                              </span>
                            </span>
                            <FormattedNumberInput
                              controlSize="field"
                              value={line.quantity}
                              onValueChange={(value) =>
                                patchPoLine(draft.supplierId, line.key, {
                                  quantity: value,
                                })
                              }
                              maxFractionDigits={3}
                              placeholder={copy.quantity}
                              aria-label={copy.quantity}
                            />
                            <FormattedNumberInput
                              controlSize="field"
                              value={line.unitPrice}
                              onValueChange={(value) =>
                                patchPoLine(draft.supplierId, line.key, {
                                  unitPrice: value,
                                })
                              }
                              maxFractionDigits={0}
                              placeholder={copy.unitPrice}
                              aria-label={copy.unitPrice}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-lg"
                              onClick={() =>
                                splitPoLine(draft.supplierId, line)
                              }
                              aria-label={copy.splitPriceLine}
                            >
                              <IconPlus />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-lg"
                              onClick={() =>
                                setPoDrafts((current) =>
                                  current.map((candidate) =>
                                    candidate.supplierId === draft.supplierId
                                      ? {
                                          ...candidate,
                                          lines: candidate.lines.filter(
                                            (candidateLine) =>
                                              candidateLine.key !== line.key,
                                          ),
                                        }
                                      : candidate,
                                  ),
                                )
                              }
                              aria-label={ACTIONS_VI.delete}
                            >
                              <IconTrash />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </Item>
                ))}
              {poDrafts.length > PO_PAGE_SIZE ? (
                <Pagination
                  page={poPage}
                  pageCount={Math.ceil(poDrafts.length / PO_PAGE_SIZE)}
                  onPageChange={setPoPage}
                  totalLabel={copy.supplierOrderCount(poDrafts.length)}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </AppDialog>

      <ReasonConfirmDialog
        open={reasonAction != null}
        onOpenChange={(open) => {
          if (!open) {
            setReasonAction(undefined);
            setReason("");
          }
        }}
        title={
          reasonAction?.kind === "close"
            ? "Đóng phần còn lại của yêu cầu mua?"
            : "Hủy yêu cầu mua?"
        }
        description={reasonAction?.row.code}
        reasonId="purchase-request-status-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel="Lý do"
        reasonPlaceholder="Nhập lý do để lưu vết"
        cancelLabel={ACTIONS_VI.cancel}
        confirmLabel={
          reasonAction?.kind === "close" ? ACTIONS_VI.close : ACTIONS_VI.cancel
        }
        confirmVariant="destructive"
        isPending={isPending}
        onConfirm={runReasonAction}
      />
    </AppPage>
  );
}

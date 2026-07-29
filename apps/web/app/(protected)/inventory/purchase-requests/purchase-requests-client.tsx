"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ClipboardList as IconClipboardList,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemHeader, ItemTitle } from "@comtammatu/ui/components/item";
import { Pagination } from "@comtammatu/ui/components/pagination";
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
  createPurchaseOrdersFromRequest,
  createPurchaseRequest,
  submitPurchaseRequest,
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
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
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
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected =
    selectedId == null
      ? null
      : (rows.find((row) => row.id === selectedId) ?? null);
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

  function saveRequest() {
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
      const result = await createPurchaseRequest({
        branchId: Number(branchId),
        neededBy: neededBy || null,
        lines,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.createFailed);
        return;
      }
      toast.success(copy.createSuccess);
      setCreateOpen(false);
      resetCreate();
      router.refresh();
    });
  }

  async function submitRequest(row: PurchaseRequestRow) {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await submitPurchaseRequest({ requestId: row.id });
        if (!result.success) {
          toast.error(result.error ?? copy.submitFailed);
          return;
        }
        toast.success(copy.submitSuccess);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function openPo(row: PurchaseRequestRow) {
    setSelectedId(row.id);
    setExpectedDeliveryDate(getVNDateString());
    setPoDrafts(buildPurchaseOrderDrafts(row.items, suppliers));
    setPoPage(1);
    setPoOpen(true);
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

  function savePo() {
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
      const result = await createPurchaseOrdersFromRequest({
        requestId: selected.id,
        orders,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.createPoFailed);
        return;
      }
      toast.success(copy.createPoSuccess(orders.length));
      setPoOpen(false);
      router.refresh();
    });
  }

  function rowActions(row: PurchaseRequestRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.view,
        onSelect: () => setSelectedId(row.id),
      },
    ];
    if (row.status === "draft" && canCreateRequest) {
      actions.push({
        key: "submit",
        label: copy.submitAction,
        icon: <IconCheck data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => void submitRequest(row),
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
          <Button type="button" onClick={() => setCreateOpen(true)}>
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
          onRowClick={(row) => setSelectedId(row.id)}
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
              onClick={() => setSelectedId(row.id)}
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
          setCreateOpen(open);
          if (!open) resetCreate();
        }}
        title={copy.createTitle}
        contentClassName="max-h-dvh-95 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl"
        bodyClassName="min-h-0 overflow-y-auto"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="button" disabled={isPending} onClick={saveRequest}>
              {copy.createAction}
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
        open={selected != null && !poOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={selected?.code ?? copy.title}
        description={selected?.branchName}
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-4xl"
        bodyClassName="min-h-0 overflow-y-auto"
        footer={
          selected ? (
            <>
              {selected.status === "draft" && canCreateRequest ? (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => void submitRequest(selected)}
                >
                  {copy.submitAction}
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
                onClick={() => setSelectedId(null)}
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
                      <Link href={`/inventory/purchase-orders?poId=${po.id}`} />
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
        onOpenChange={setPoOpen}
        title={copy.createPoTitle}
        description={selected?.code}
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-4xl"
        bodyClassName="min-h-0 overflow-y-auto"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPoOpen(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              disabled={isPending || poDrafts.length === 0}
              onClick={savePo}
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
    </AppPage>
  );
}

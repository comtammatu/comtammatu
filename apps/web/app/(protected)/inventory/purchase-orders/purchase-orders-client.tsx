"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  Eye as IconEye,
  PackagePlus as IconPackagePlus,
  Plus as IconPlus,
  Save as IconSave,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
  Trash2 as IconTrash,
} from "lucide-react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { toast } from "@comtammatu/ui/components/sonner";
import { useFormControlSize } from "@/components/form/control-size";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  AppDialog,
  FormattedNumberInput,
  FormDialog,
  MoneyVndField,
  NumberField,
  SelectField,
  TextField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  AppPage,
  AppPageHeader,
  AppToolbar,
  DescriptionList,
} from "@/components/surface";
import {
  getStatusBadgeMeta,
  StatusBadge,
} from "@/components/status-badge";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { InventoryListFrame } from "../_components/inventory-list-frame";
import {
  approvePurchaseOrder,
  createGrnFromPurchaseOrder,
  createPurchaseOrderWithLines,
  updatePurchaseOrderPrices,
} from "../purchase-order-actions";

const poCopy = messages.inventory.po;

export type PurchaseOrderLineRow = {
  id: number;
  ingredientName: string;
  quantity: number;
  unitLabel: string;
  monetary: {
    unitPriceEst: number | null;
    lineTotal: number | null;
  } | null;
};

export type PurchaseOrderLinkedGrn = {
  id: number;
  code: string;
  status: string;
  receivedAt: string | null;
};

export type PurchaseOrderRow = {
  id: number;
  code: string;
  status: string;
  orderedAt: string;
  notes: string | null;
  supplierName: string;
  branchName: string;
  lineCount: number;
  monetary: { estimatedTotal: number | null } | null;
  lines: PurchaseOrderLineRow[];
  linkedGrns: PurchaseOrderLinkedGrn[];
};

export type PurchaseOrderOption = {
  id: number;
  name: string;
};

export type PurchaseOrderIngredient = PurchaseOrderOption & {
  units: PurchaseOrderOption[];
  supplierIds: number[];
};

const lineSchema = z.object({
  ingredientId: z.string().min(1, { error: "Chọn nguyên liệu." }),
  quantity: z.string().refine((value) => Number(value) > 0, {
    error: "Số lượng phải lớn hơn 0.",
  }),
  entryUnitId: z.string().min(1, { error: "Chọn đơn vị mua." }),
  unitPriceEst: z
    .string()
    .refine((value) => value === "" || Number(value) >= 0, {
      error: "Đơn giá không hợp lệ.",
    }),
});

const poFormSchema = z
  .object({
    supplierId: z.string().min(1, { error: "Chọn nhà cung cấp." }),
    branchId: z.string().min(1, { error: "Chọn chi nhánh nhận hàng." }),
    notes: z.string().trim().max(500).optional(),
    lines: z
      .array(lineSchema)
      .min(1, { error: "Thêm ít nhất một nguyên liệu." }),
  })
  .superRefine((data, ctx) => {
    const ingredientIds = data.lines.map((line) => line.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Mỗi nguyên liệu chỉ được xuất hiện một lần.",
      });
    }
  });

type PurchaseOrderFormValues = z.infer<typeof poFormSchema>;

function emptyLine(): PurchaseOrderFormValues["lines"][number] {
  return {
    ingredientId: "",
    quantity: "",
    entryUnitId: "",
    unitPriceEst: "",
  };
}

function PurchaseOrderLineFields({
  form,
  index,
  ingredients,
  canRemove,
  onRemove,
}: {
  form: UseFormReturn<
    PurchaseOrderFormValues,
    unknown,
    PurchaseOrderFormValues
  >;
  index: number;
  ingredients: PurchaseOrderIngredient[];
  canRemove: boolean;
  onRemove: () => void;
}) {
  const ingredientPath = `lines.${index}.ingredientId` as const;
  const unitPath = `lines.${index}.entryUnitId` as const;
  const ingredientId = useWatch({
    control: form.control,
    name: ingredientPath,
  });
  const ingredient =
    ingredients.find((item) => item.id === Number(ingredientId)) ?? null;
  const unitOptions = ingredient?.units ?? [];

  useEffect(() => {
    if (!ingredientId || ingredient) return;
    form.setValue(ingredientPath, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(unitPath, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [form, ingredient, ingredientId, ingredientPath, unitPath]);

  useEffect(() => {
    const current = form.getValues(unitPath);
    if (!unitOptions.some((unit) => String(unit.id) === current)) {
      const next = unitOptions[0] ? String(unitOptions[0].id) : "";
      if (current === next) return;
      form.setValue(unitPath, next, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [form, unitOptions, unitPath]);

  return (
    <Item variant="outline" className="flex-col items-stretch gap-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField
            control={form.control}
            name={ingredientPath}
            label="Nguyên liệu"
            options={ingredients.map((item) => ({
              value: String(item.id),
              label: item.name,
            }))}
            required
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <IconTrash />
          <span className="sr-only">{poCopy.removeLineAria}</span>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField
          control={form.control}
          name={`lines.${index}.quantity`}
          label="Số lượng"
          maxFractionDigits={3}
          required
        />
        <SelectField
          control={form.control}
          name={unitPath}
          label="Đơn vị"
          options={unitOptions.map((unit) => ({
            value: String(unit.id),
            label: unit.name,
          }))}
          disabled={!ingredient}
          required
        />
        <MoneyVndField
          control={form.control}
          name={`lines.${index}.unitPriceEst`}
          label="Đơn giá dự kiến"
        />
      </div>
    </Item>
  );
}

function PurchaseOrderFields({
  form,
  suppliers,
  branches,
  ingredients,
}: {
  form: UseFormReturn<
    PurchaseOrderFormValues,
    unknown,
    PurchaseOrderFormValues
  >;
  suppliers: PurchaseOrderOption[];
  branches: PurchaseOrderOption[];
  ingredients: PurchaseOrderIngredient[];
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const supplierId = useWatch({
    control: form.control,
    name: "supplierId",
  });
  const supplierIngredients = useMemo(
    () =>
      ingredients.filter((item) =>
        item.supplierIds.includes(Number(supplierId)),
      ),
    [ingredients, supplierId],
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="supplierId"
          label="Nhà cung cấp"
          options={suppliers.map((item) => ({
            value: String(item.id),
            label: item.name,
          }))}
          required
        />
        <SelectField
          control={form.control}
          name="branchId"
          label="Nơi nhận hàng"
          options={branches.map((item) => ({
            value: String(item.id),
            label: item.name,
          }))}
          required
        />
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{poCopy.linesTitle}</p>
        {supplierId && supplierIngredients.length === 0 ? (
          <p className="text-sm text-warning">{poCopy.noSupplierItems}</p>
        ) : null}
        {fields.map((field, index) => (
          <PurchaseOrderLineFields
            key={field.id}
            form={form}
            index={index}
            ingredients={supplierIngredients}
            canRemove={fields.length > 1}
            onRemove={() => remove(index)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={supplierIngredients.length === 0}
          onClick={() => append(emptyLine())}
        >
          <IconPlus />
          {poCopy.addLine}
        </Button>
      </div>
      <TextField
        control={form.control}
        name="notes"
        label={FORM_VI.notes}
        placeholder={poCopy.notesPlaceholder}
      />
    </>
  );
}

export function PurchaseOrdersClient({
  rows,
  suppliers,
  branches,
  ingredients,
  defaultBranchId,
  canCreate,
  canApprove,
  canCreateGrn,
  canViewPrices,
}: {
  rows: PurchaseOrderRow[];
  suppliers: PurchaseOrderOption[];
  branches: PurchaseOrderOption[];
  ingredients: PurchaseOrderIngredient[];
  defaultBranchId: number | null;
  canCreate: boolean;
  canApprove: boolean;
  canCreateGrn: boolean;
  canViewPrices: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<number, string>>({});
  const [pricesDirty, setPricesDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultValues = useMemo<PurchaseOrderFormValues>(
    () => ({
      supplierId: "",
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      notes: "",
      lines: [emptyLine()],
    }),
    [defaultBranchId],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          [
            row.code,
            row.supplierName,
            row.branchName,
            row.notes ?? "",
            getStatusBadgeMeta("purchase-order", row.status).label,
          ],
          search,
        ),
      ),
    [rows, search],
  );
  const selectedRow =
    selectedPoId == null
      ? null
      : (rows.find((row) => row.id === selectedPoId) ?? null);

  function openDetail(row: PurchaseOrderRow) {
    setPriceDraft(
      Object.fromEntries(
        row.lines.map((line) => [
          line.id,
          line.monetary?.unitPriceEst == null
            ? ""
            : String(line.monetary.unitPriceEst),
        ]),
      ),
    );
    setPricesDirty(false);
    setSelectedPoId(row.id);
  }

  function closeDetail() {
    setSelectedPoId(null);
  }

  function savePrices(row: PurchaseOrderRow) {
    const lines = row.lines.map((line) => ({
      lineId: line.id,
      unitPrice: Number(priceDraft[line.id]),
    }));
    if (lines.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      toast.error("Nhập đơn giá lớn hơn 0 cho mọi dòng.");
      return;
    }

    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await updatePurchaseOrderPrices({ poId: row.id, lines });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setPricesDirty(false);
        toast.success("Đã lưu giá mua");
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  async function approve(row: PurchaseOrderRow) {
    // confirm() must run outside startTransition — transition-deferred
    // setState can leave the AlertDialog closed after menu/sheet interactions.
    const accepted = await confirm({
      title: `Duyệt ${row.code}?`,
      description:
        "Sau khi duyệt, đơn đặt hàng có thể được dùng để tạo phiếu nhập kho.",
      confirmText: "Duyệt mua",
    });
    if (!accepted) return;
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await approvePurchaseOrder({ poId: row.id });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(`Đã duyệt ${row.code}`);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function createGrn(row: PurchaseOrderRow) {
    setPendingId(row.id);
    startTransition(async () => {
      try {
        const result = await createGrnFromPurchaseOrder({ poId: row.id });
        if (!result.success || !result.data) {
          toast.error(result.error);
          return;
        }
        toast.success("Đã tạo phiếu nhập từ đơn đặt hàng");
        router.push(`/inventory/grn/${result.data.id}`);
      } finally {
        setPendingId(null);
      }
    });
  }

  function renderActions(row: PurchaseOrderRow, touch = false) {
    const items: RowActionItem[] = [
      {
        key: "view",
        label: poCopy.viewDetail,
        icon: <IconEye data-icon="inline-start" />,
        onSelect: () => openDetail(row),
      },
    ];
    if (row.status === "draft" && canApprove) {
      items.push({
        key: "approve",
        label: poCopy.approveAction,
        icon: <IconCheck data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => {
          void approve(row);
        },
      });
    }
    if (["sent", "partially_received"].includes(row.status) && canCreateGrn) {
      items.push({
        key: "receive",
        label: poCopy.createGrnAction,
        icon: <IconPackagePlus data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => createGrn(row),
      });
    }
    return (
      <div
        className="flex justify-end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowActionsMenu
          items={items}
          label={poCopy.viewDetailAria(row.code)}
          triggerSize={touch ? "icon-touch" : "icon"}
        />
      </div>
    );
  }

  const lineColumns: DataTableColumn<PurchaseOrderLineRow>[] = [
    {
      key: "item",
      header: poCopy.detail.item,
      render: (line) => line.ingredientName,
    },
    {
      key: "qty",
      header: poCopy.quantityShort,
      className: "text-right font-mono tabular-nums",
      render: (line) => `${line.quantity} ${line.unitLabel}`,
    },
    ...(canViewPrices
      ? [
          {
            key: "price",
            header: poCopy.unitPrice,
            className: "text-right font-mono tabular-nums",
            render: (line: PurchaseOrderLineRow) =>
              selectedRow?.status === "draft" && canCreate ? (
                <FormattedNumberInput
                  inputMode="numeric"
                  maxFractionDigits={0}
                  aria-label={`Đơn giá ${line.ingredientName}`}
                  value={priceDraft[line.id] ?? ""}
                  onValueChange={(value) => {
                    setPriceDraft((current) => ({
                      ...current,
                      [line.id]: value,
                    }));
                    setPricesDirty(true);
                  }}
                  className="ml-auto w-32 text-right font-mono"
                />
              ) : line.monetary?.unitPriceEst == null ? (
                "—"
              ) : (
                formatVND(line.monetary.unitPriceEst)
              ),
          },
        ]
      : []),
    ...(canViewPrices
      ? [
          {
            key: "total",
            header: poCopy.estimatedTotal,
            className: "text-right font-mono tabular-nums",
            render: (line: PurchaseOrderLineRow) =>
              line.monetary?.lineTotal == null
                ? "—"
                : formatVND(line.monetary.lineTotal),
          },
        ]
      : []),
  ];

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: "Số đơn đặt hàng",
      render: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-mono font-medium"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(row);
          }}
        >
          {row.code}
        </Button>
      ),
    },
    {
      key: "supplier",
      header: "Nhà cung cấp",
      render: (row) => row.supplierName,
    },
    {
      key: "branch",
      header: "Chi nhánh",
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <StatusBadge domain="purchase-order" value={row.status} />
      ),
    },
    ...(canViewPrices
      ? [
          {
            key: "total",
            header: "Tạm tính",
            className: "text-right font-mono",
            render: (row: PurchaseOrderRow) =>
              row.monetary?.estimatedTotal == null
                ? "—"
                : formatVND(row.monetary.estimatedTotal),
          },
        ]
      : []),
    {
      key: "date",
      header: "Ngày lập",
      render: (row) => formatVNDate(row.orderedAt),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => renderActions(row),
    },
  ];
  const listToolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={poCopy.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={poCopy.searchPlaceholder}
          />
        </InputGroup>
      }
      reset={
        <Badge variant="outline">
          {filteredRows.length}/{rows.length}
        </Badge>
      }
    />
  );

  const detailFooter =
    selectedRow == null ? null : (
      <>
        {selectedRow.status === "draft" && canCreate ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !pricesDirty}
            onClick={() => savePrices(selectedRow)}
          >
            <IconSave data-icon="inline-start" />
            {poCopy.savePricesAction}
          </Button>
        ) : null}
        {selectedRow.status === "draft" && canApprove ? (
          <Button
            type="button"
            disabled={
              isPending ||
              pendingId === selectedRow.id ||
              pricesDirty ||
              selectedRow.lines.some(
                (line) =>
                  line.monetary?.unitPriceEst == null ||
                  line.monetary.unitPriceEst <= 0,
              )
            }
            onClick={() => {
              void approve(selectedRow);
            }}
          >
            <IconCheck data-icon="inline-start" />
            {poCopy.approveAction}
          </Button>
        ) : null}
        {["sent", "partially_received"].includes(selectedRow.status) &&
          canCreateGrn ? (
          <Button
            type="button"
            disabled={isPending || pendingId === selectedRow.id}
            onClick={() => createGrn(selectedRow)}
          >
            <IconPackagePlus data-icon="inline-start" />
            {poCopy.createGrnAction}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={closeDetail}>
          {ACTIONS_VI.close}
        </Button>
      </>
    );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={poCopy.pageTitle}
        description={poCopy.pageDescription}
        actions={
          canCreate ? (
            <Button
              size="lg"
              onClick={() => setCreateOpen(true)}
              disabled={
                suppliers.length === 0 ||
                branches.length === 0 ||
                ingredients.length === 0
              }
            >
              <IconPlus />
              {poCopy.createPo}
            </Button>
          ) : null
        }
      />
      <InventoryListFrame toolbar={listToolbar}>
        <DataTable
          columns={columns}
          data={filteredRows}
          getRowKey={(row) => row.id}
          pageSize={50}
          onRowClick={openDetail}
          getRowAriaLabel={(row) => poCopy.viewDetailAria(row.code)}
          getRowDataState={(row) =>
            row.id === selectedPoId ? "selected" : undefined
          }
          emptyTitle={poCopy.emptyInitialTitle}
          emptyDescription={poCopy.emptyInitialDescription}
          emptyIcon={
            <IconShoppingCart className="size-8 text-muted-foreground" />
          }
          mobileCardRender={(row) => (
            <Item
              variant="outline"
              role="button"
              tabIndex={0}
              aria-label={poCopy.viewDetailAria(row.code)}
              className="cursor-pointer"
              onClick={() => openDetail(row)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail(row);
                }
              }}
            >
              <ItemContent>
                <ItemTitle>{row.code}</ItemTitle>
                <ItemDescription>
                  {row.supplierName} · {row.branchName}
                </ItemDescription>
                <ItemDescription>
                  {poCopy.lineCount(row.lineCount)}
                  {row.monetary
                    ? ` · ${
                        row.monetary.estimatedTotal == null
                          ? "Chưa có tạm tính"
                          : formatVND(row.monetary.estimatedTotal)
                      }`
                    : ""}
                </ItemDescription>
              </ItemContent>
              <ItemFooter>
                <StatusBadge domain="purchase-order" value={row.status} />
                <ItemActions>{renderActions(row, true)}</ItemActions>
              </ItemFooter>
            </Item>
          )}
        />
      </InventoryListFrame>

      <AppDialog
        open={selectedRow != null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        title={
          selectedRow ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{selectedRow.code}</span>
              <StatusBadge
                domain="purchase-order"
                value={selectedRow.status}
              />
            </div>
          ) : (
            poCopy.detail.title
          )
        }
        description={
          selectedRow
            ? `${selectedRow.supplierName} · ${selectedRow.branchName} · ${formatVNDate(selectedRow.orderedAt)}`
            : undefined
        }
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-5xl"
        bodyClassName="min-h-0 overflow-hidden"
        footer={detailFooter}
      >
        {selectedRow ? (
          <>
            <DescriptionList
              className="sm:grid sm:grid-cols-3 sm:gap-4"
              items={[
                {
                  term: poCopy.supplierRequired,
                  description: selectedRow.supplierName,
                },
                {
                  term: poCopy.branchLabel,
                  description: selectedRow.branchName,
                },
                ...(selectedRow.monetary
                  ? [
                      {
                        term: poCopy.estimatedTotal,
                        description:
                          selectedRow.monetary.estimatedTotal == null
                            ? "—"
                            : formatVND(selectedRow.monetary.estimatedTotal),
                      },
                    ]
                  : []),
              ]}
            />

            <div className="flex min-h-0 flex-col gap-2">
              <p className="text-sm font-medium">
                {poCopy.detail.overviewLinesTitle}
              </p>
              <Frame className="h-72 min-h-0 overflow-hidden sm:h-80">
                <ScrollArea className="h-full">
                  <DataTable
                    columns={lineColumns}
                    data={selectedRow.lines}
                    getRowKey={(line) => line.id}
                    emptyTitle={poCopy.emptyLinesTitle}
                    emptyDescription={poCopy.emptyLinesDescription}
                    mobileCardRender={(line) => (
                      <Item variant="muted" className="items-start">
                        <ItemContent className="min-w-0">
                          <ItemTitle className="break-words">
                            {line.ingredientName}
                          </ItemTitle>
                          <ItemDescription>
                            {line.quantity} {line.unitLabel}
                            {line.monetary?.unitPriceEst == null
                              ? ""
                              : ` · ${formatVND(line.monetary.unitPriceEst)}`}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <span className="font-mono tabular-nums">
                            {line.monetary?.lineTotal == null
                              ? "—"
                              : formatVND(line.monetary.lineTotal)}
                          </span>
                        </ItemActions>
                      </Item>
                    )}
                  />
                </ScrollArea>
              </Frame>
            </div>

            {selectedRow.notes ? (
              <p className="break-words text-sm italic text-muted-foreground">
                {selectedRow.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{poCopy.noNotes}</p>
            )}

            {selectedRow.linkedGrns.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {poCopy.detail.linkedGrnsTitle}
                </p>
                <div className="flex flex-col gap-2">
                  {selectedRow.linkedGrns.map((grn) => (
                    <Item key={grn.id} variant="outline" size="sm">
                      <ItemContent>
                        <ItemTitle className="font-mono">{grn.code}</ItemTitle>
                        <ItemDescription>
                          {grn.receivedAt
                            ? formatVNDate(grn.receivedAt)
                            : poCopy.noReceivedDate}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="gap-2">
                        <StatusBadge domain="inventory" value={grn.status} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          render={<Link href={`/inventory/grn/${grn.id}`} />}
                        >
                          {poCopy.openLinkedGrn}
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </AppDialog>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={poCopy.newTitle}
        description={poCopy.draftDescription}
        schema={poFormSchema}
        defaultValues={defaultValues}
        submitLabel="Lưu đơn nháp"
        contentClassName="sm:max-w-3xl"
        onSubmit={(values) =>
          createPurchaseOrderWithLines({
            supplierId: Number(values.supplierId),
            branchId: Number(values.branchId),
            notes: values.notes,
            lines: values.lines.map((line) => ({
              ingredientId: Number(line.ingredientId),
              quantity: Number(line.quantity),
              entryUnitId: Number(line.entryUnitId),
              unitPriceEst:
                line.unitPriceEst === "" ? null : Number(line.unitPriceEst),
            })),
          })
        }
        onSuccess={() => {
          toast.success("Đã tạo đơn đặt hàng nháp");
          router.refresh();
        }}
      >
        {(form) => (
          <PurchaseOrderFields
            form={form}
            suppliers={suppliers}
            branches={branches}
            ingredients={ingredients}
          />
        )}
      </FormDialog>
    </AppPage>
  );
}

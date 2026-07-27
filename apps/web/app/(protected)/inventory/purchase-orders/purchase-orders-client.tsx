"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  PackagePlus as IconPackagePlus,
  Plus as IconPlus,
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  FormDialog,
  MoneyVndField,
  NumberField,
  SelectField,
  TextareaField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  getStatusBadgeMeta,
  StatusBadge,
} from "@/components/status-badge";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { InventoryListFrame } from "../_components/inventory-list-frame";
import {
  approvePurchaseOrder,
  createGrnFromPurchaseOrder,
  createPurchaseOrderWithLines,
} from "../purchase-order-actions";

const poCopy = messages.inventory.po;

export type PurchaseOrderRow = {
  id: number;
  code: string;
  status: string;
  orderedAt: string;
  supplierName: string;
  branchName: string;
  lineCount: number;
  estimatedTotal: number | null;
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
    <Item variant="outline" className="grid gap-3 sm:grid-cols-12">
      <SelectField
        control={form.control}
        name={ingredientPath}
        label="Nguyên liệu"
        options={ingredients.map((item) => ({
          value: String(item.id),
          label: item.name,
        }))}
        className="sm:col-span-4"
        required
      />
      <NumberField
        control={form.control}
        name={`lines.${index}.quantity`}
        label="Số lượng"
        maxFractionDigits={3}
        className="sm:col-span-2"
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
        className="sm:col-span-2"
        required
      />
      <MoneyVndField
        control={form.control}
        name={`lines.${index}.unitPriceEst`}
        label="Đơn giá dự kiến"
        className="sm:col-span-3"
      />
      <div className="flex items-end sm:col-span-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <IconTrash />
          <span className="sr-only">{poCopy.removeLineAria}</span>
        </Button>
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
          label="Chi nhánh nhận hàng"
          options={branches.map((item) => ({
            value: String(item.id),
            label: item.name,
          }))}
          required
        />
      </div>
      <TextareaField
        control={form.control}
        name="notes"
        label="Ghi chú"
        rows={2}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{poCopy.linesTitle}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={supplierIngredients.length === 0}
          onClick={() => append(emptyLine())}
        >
          <IconPlus />
          {poCopy.addLine}
        </Button>
      </div>
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
}: {
  rows: PurchaseOrderRow[];
  suppliers: PurchaseOrderOption[];
  branches: PurchaseOrderOption[];
  ingredients: PurchaseOrderIngredient[];
  defaultBranchId: number | null;
  canCreate: boolean;
  canApprove: boolean;
  canCreateGrn: boolean;
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
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
            getStatusBadgeMeta("purchase-order", row.status).label,
          ],
          search,
        ),
      ),
    [rows, search],
  );

  function approve(row: PurchaseOrderRow) {
    startTransition(async () => {
      const accepted = await confirm({
        title: `Duyệt ${row.code}?`,
        description:
          "Sau khi duyệt, PO có thể được dùng để tạo phiếu nhập kho.",
        confirmText: "Duyệt mua",
      });
      if (!accepted) return;
      setPendingId(row.id);
      const result = await approvePurchaseOrder({ poId: row.id });
      setPendingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã duyệt ${row.code}`);
      router.refresh();
    });
  }

  function createGrn(row: PurchaseOrderRow) {
    setPendingId(row.id);
    startTransition(async () => {
      const result = await createGrnFromPurchaseOrder({ poId: row.id });
      setPendingId(null);
      if (!result.success || !result.data) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã tạo phiếu nhập từ PO");
      router.push(`/inventory/grn/${result.data.id}`);
    });
  }

  function renderActions(row: PurchaseOrderRow, touch = false) {
    const items: RowActionItem[] = [];
    if (row.status === "draft" && canApprove) {
      items.push({
        key: "approve",
        label: "Duyệt mua",
        icon: <IconCheck data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => approve(row),
      });
    }
    if (["sent", "partially_received"].includes(row.status) && canCreateGrn) {
      items.push({
        key: "receive",
        label: "Tạo phiếu nhập",
        icon: <IconPackagePlus data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => createGrn(row),
      });
    }
    return items.length > 0 ? (
      <RowActionsMenu
        items={items}
        triggerSize={touch ? "icon-touch" : "icon"}
      />
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "code",
      header: "Số PO",
      render: (row) => (
        <span className="font-mono font-medium">{row.code}</span>
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
    {
      key: "total",
      header: "Tạm tính",
      className: "text-right font-mono",
      render: (row) =>
        row.estimatedTotal == null ? "—" : formatVND(row.estimatedTotal),
    },
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
        <InputGroup
          size={isTouchLayout ? "touch" : "field"}
          className="min-w-0 flex-1 sm:min-w-72"
        >
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
          emptyTitle={poCopy.emptyInitialTitle}
          emptyDescription={poCopy.emptyInitialDescription}
          emptyIcon={
            <IconShoppingCart className="size-8 text-muted-foreground" />
          }
          mobileCardRender={(row) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>{row.code}</ItemTitle>
                <ItemDescription>
                  {row.supplierName} · {row.branchName}
                </ItemDescription>
                <ItemDescription>
                  {poCopy.lineCount(row.lineCount)} ·{" "}
                  {row.estimatedTotal == null
                    ? "Chưa có tạm tính"
                    : formatVND(row.estimatedTotal)}
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

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={poCopy.newTitle}
        description={poCopy.draftDescription}
        schema={poFormSchema}
        defaultValues={defaultValues}
        submitLabel="Lưu PO nháp"
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
          toast.success("Đã tạo PO nháp");
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

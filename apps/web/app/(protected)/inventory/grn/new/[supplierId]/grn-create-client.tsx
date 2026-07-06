"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
  Pencil as IconPencil,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Button } from "@comtammatu/ui/components/button";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import {
  MoneyVndInput,
  NumberPadSheet,
  QuantityInput,
} from "@/components/form";
import { matchesSearch } from "@lib/search";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  draftTotal,
  type GrnDraft,
  type GrnDraftLine,
} from "../../../_lib/grn-draft";
import { formatVND } from "../../../_lib/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
  type PurchaseUnitOption,
} from "../../../_lib/purchase-units";
import type { IngredientUnitRow } from "../../../_lib/types";
import {
  createGrnDraft,
  deleteGrnLine,
  discardGrnDraft,
  upsertGrnLine,
} from "../../../grn-actions";

import { ACTIONS_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number | null;
  category: string | null;
  units?: IngredientUnitRow[];
};

type ServerDraftLine = GrnDraftLine & { lineId: number };

type ProcurementBranchOption = { id: number; name: string };

type Props = {
  supplier: { id: number; name: string };
  branchId: number | null;
  procurementBranches: ProcurementBranchOption[];
  canSwitchBranch: boolean;
  ingredients: Ingredient[];
  existingDraft: { id: number; lines: ServerDraftLine[] } | null;
  basePath?: string;
  grnBasePath?: string;
  embedded?: boolean;
};

const DEFAULT_VARIANCE_WARNING = 0.2;

const GRN_CREATE_COPY = {
  changeSupplier: "Đổi nhà cung cấp",
  newReceiptEyebrow: "Phiếu nhập mới",
  newReceiptDescription:
    "Thêm nguyên liệu rồi lưu nháp. Bước chốt nhập kho nằm ở màn hình chi tiết.",
  discardDraft: "Hủy nháp",
  addItemToContinue: "Thêm mặt hàng để tiếp tục",
  unitCostTitle: "Đơn giá nhập",
  editItem: "Sửa mặt hàng",
  addItem: "Thêm mặt hàng",
  editLineAria: "Sửa dòng",
  deleteLineAria: "Xóa dòng",
  searchPlaceholder: "Tìm theo tên hoặc mã SKU",
  emptyTitle: "Không thấy nguyên liệu",
  emptyDescription: "Thử từ khóa khác hoặc kiểm tra lại danh mục.",
  panelEmptyTitle: "Chưa chọn mặt hàng",
  panelEmptyDescription: "Chọn một nguyên liệu ở danh sách để sửa thông tin.",
  optionalNote: "Ghi chú (tùy chọn)",
  notePlaceholder: "Tình trạng, nhiệt độ...",
  addedSummary: (lineCount: number) => `Đã thêm ${lineCount} mặt hàng`,
  saveDraft: (lineCount: number, total: number) =>
    `Lưu phiếu nháp · ${lineCount} mặt hàng · ${formatVND(total)}`,
  lineUnitCost: (quantity: number, unit: string, unitCost: number) =>
    `${quantity} ${unit} · ${formatVND(unitCost)}/${unit} ·`,
  unitLabel: (unit: string) => `Đơn vị: ${unit}`,
  unitPriceUnit: (unit: string) => `đ / ${unit}`,
  moneyVnd: (value: number) => formatVND(value),
  lastCost: (value: number, unit: string) => `${formatVND(value)}/${unit}`,
  varianceWarning: (variance: number) =>
    `Giá chênh ${(variance * 100).toFixed(0)}% so với lần trước — kiểm tra lại trước khi lưu.`,
  currencySuffix: "đ",
  branchUnselected: "Chưa chọn kho nhận",
  toastChooseBranch: "Chưa có kho nhận hàng cho phiếu nhập.",
  toastCreateDraftFailed: "Không thể tạo phiếu nháp.",
  toastSaveLineFailed: "Không lưu được dòng.",
  toastDeleteLineFailed: "Không xóa được dòng.",
  toastDiscardDraftTitle: "Xóa phiếu nháp này?",
  toastDiscardDraftDesc: "Các dòng đã nhập sẽ mất.",
  toastDiscardDraftFailed: "Không thể hủy phiếu nháp.",
  toastNoLines: "Phiếu chưa có dòng nào.",
  labelQuantity: (unit: string) => `Số lượng (${unit})`,
};

type EditState = {
  ingredient: Ingredient;
  line: GrnDraftLine | null;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  unitCost: number;
  note: string;
};

// Desktop (lg+) docks line-edit inline instead of the mobile bottom sheet.
let deskLineEditMql: MediaQueryList | null = null;

function getDeskLineEditQuery(): MediaQueryList {
  deskLineEditMql ??= window.matchMedia("(min-width: 1024px)");
  return deskLineEditMql;
}

function subscribeDeskLineEdit(onStoreChange: () => void): () => void {
  const list = getDeskLineEditQuery();
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getDeskLineEditSnapshot(): boolean {
  return getDeskLineEditQuery().matches;
}

function getDeskLineEditServerSnapshot(): boolean {
  return false;
}

function useIsDesktopLineEdit(): boolean {
  return React.useSyncExternalStore(
    subscribeDeskLineEdit,
    getDeskLineEditSnapshot,
    getDeskLineEditServerSnapshot,
  );
}

export function GrnCreateClient({
  supplier,
  branchId: initialBranchId,
  procurementBranches,
  canSwitchBranch,
  ingredients,
  existingDraft,
  basePath = "/inventory/grn/new",
  grnBasePath = "/inventory/grn",
  embedded = false,
}: Props) {
  const router = useRouter();
  // Desktop 2-column line-edit is an office-surface upgrade only; the branch
  // operator root (embedded) always stays single-column regardless of viewport.
  const isDesktopLineEdit = useIsDesktopLineEdit() && !embedded;
  // Sprint 6 #3: server-side draft is the source of truth. React state mirrors
  // server state for UI rendering; lazy-create on first saveLine when no
  // draft exists yet.
  const [draft, setDraft] = React.useState<GrnDraft>(() => ({
    draftId: existingDraft
      ? `srv-${existingDraft.id}`
      : `pending-${supplier.id}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    branchId: initialBranchId,
    lines: existingDraft?.lines ?? [],
    updatedAt: new Date().toISOString(),
  }));
  const [serverGrnId, setServerGrnId] = React.useState<number | null>(
    existingDraft?.id ?? null,
  );
  // Receiving warehouse for the receipt. Locked once a server draft exists,
  // since createGrnDraft binds branch_id at creation and never rewrites it.
  const [branchId, setBranchId] = React.useState<number | null>(
    initialBranchId,
  );
  const [query, setQuery] = React.useState("");
  const [edit, setEdit] = React.useState<EditState | null>(null);
  const [numpad, setNumpad] = React.useState<"qty" | "cost" | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Lazy-create the server-side draft on first interaction, returning grnId.
  // Idempotent via partial UNIQUE index uq_grn_active_draft_per_user_supplier;
  // race-friendly fallback in createGrnDraft refetches the existing draft.
  async function ensureServerDraft(): Promise<number | null> {
    if (serverGrnId !== null) return serverGrnId;
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return null;
    }
    const created = await createGrnDraft({
      supplierId: supplier.id,
      branchId,
    });
    if (!created.success) {
      setSubmitError(created.error ?? GRN_CREATE_COPY.toastCreateDraftFailed);
      return null;
    }
    const id = (created.data as { id: number } | undefined)?.id ?? null;
    if (id !== null) setServerGrnId(id);
    return id;
  }

  const addedMap = React.useMemo(() => {
    const map = new Map<number, GrnDraftLine>();
    draft.lines.forEach((line) => map.set(line.ingredientId, line));
    return map;
  }, [draft]);

  const filtered = React.useMemo(() => {
    const needle = query.trim();
    if (!needle) return ingredients;
    return ingredients.filter((item) =>
      matchesSearch([item.name, item.sku], needle),
    );
  }, [query, ingredients]);

  function applyLines(nextLines: GrnDraftLine[]) {
    setDraft((current) => ({
      ...current,
      lines: nextLines,
      updatedAt: new Date().toISOString(),
    }));
  }

  function openEdit(ingredient: Ingredient) {
    const existing = addedMap.get(ingredient.id);
    const defaultUnit = getDefaultPurchaseUnit(ingredient);
    setEdit({
      ingredient,
      line: existing ?? null,
      quantity: existing?.quantity ?? 0,
      unit: existing?.unit ?? defaultUnit?.label ?? ingredient.unit,
      entryUnitId: existing
        ? (existing.entryUnitId ?? null)
        : (defaultUnit?.unitId ?? null),
      unitCost: existing?.unitCost ?? Number(ingredient.unit_cost ?? 0),
      note: existing?.note ?? "",
    });
  }

  function closeEdit() {
    setEdit(null);
    setNumpad(null);
  }

  async function saveLine() {
    if (!edit) return;
    if (edit.quantity <= 0 || edit.unitCost < 0) return;
    setSubmitError(null);
    try {
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      const lineRes = await upsertGrnLine({
        grnId,
        ingredientId: edit.ingredient.id,
        receivedQuantity: edit.quantity,
        entryUnitId: edit.entryUnitId,
        unitCost: edit.unitCost,
        qualityStatus: "accepted",
      });
      if (!lineRes.success) {
        setSubmitError(lineRes.error ?? GRN_CREATE_COPY.toastSaveLineFailed);
        return;
      }
      const lineId = (lineRes.data as { id: number } | undefined)?.id ?? 0;
      const nextLine: GrnDraftLine & { lineId?: number } = {
        ingredientId: edit.ingredient.id,
        ingredientName: edit.ingredient.name,
        unit: edit.unit,
        entryUnitId: edit.entryUnitId,
        quantity: edit.quantity,
        unitCost: edit.unitCost,
        note: edit.note.trim() ? edit.note.trim() : undefined,
      };
      if (lineId) (nextLine as ServerDraftLine).lineId = lineId;
      const idx = draft.lines.findIndex(
        (l) => l.ingredientId === edit.ingredient.id,
      );
      applyLines(
        idx >= 0
          ? draft.lines.map((l, i) => (i === idx ? { ...l, ...nextLine } : l))
          : [...draft.lines, nextLine as ServerDraftLine],
      );
      closeEdit();
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Không thể lưu dòng.",
      );
    }
  }

  async function removeLine(ingredientId: number) {
    const target = draft.lines.find((l) => l.ingredientId === ingredientId) as
      | ServerDraftLine
      | undefined;
    if (target?.lineId && serverGrnId !== null) {
      const res = await deleteGrnLine({
        grnId: serverGrnId,
        lineId: target.lineId,
      });
      if (!res.success) {
        setSubmitError(res.error ?? GRN_CREATE_COPY.toastDeleteLineFailed);
        return;
      }
    }
    applyLines(draft.lines.filter((l) => l.ingredientId !== ingredientId));
  }

  async function discardDraft() {
    const ok = await confirm({
      title: GRN_CREATE_COPY.toastDiscardDraftTitle,
      description: GRN_CREATE_COPY.toastDiscardDraftDesc,
      variant: "destructive",
    });
    if (!ok) return;
    if (serverGrnId !== null) {
      const res = await discardGrnDraft({ grnId: serverGrnId });
      if (!res.success) {
        setSubmitError(res.error ?? GRN_CREATE_COPY.toastDiscardDraftFailed);
        return;
      }
    }
    router.push(basePath);
  }

  async function submit() {
    if (draft.lines.length === 0) {
      setSubmitError(GRN_CREATE_COPY.toastNoLines);
      return;
    }
    if (!branchId) {
      setSubmitError(GRN_CREATE_COPY.toastChooseBranch);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Server-side draft already has all lines (lazy-created on first save +
      // each line upsert is server-of-truth). Submit only opens the review
      // surface; it must not re-write lines on every navigation.
      const grnId = await ensureServerDraft();
      if (grnId === null) return;
      router.push(`${grnBasePath}/${grnId}?review=1`);
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Không thể gửi phiếu. Vui lòng thử lại.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const total = draftTotal(draft);
  const lineCount = draft.lines.length;
  const canSubmit = lineCount > 0 && !submitting;
  const branchLocked = serverGrnId !== null;
  const showWarehousePicker = canSwitchBranch && procurementBranches.length > 1;
  const showWarehouseEditor = showWarehousePicker && !branchLocked;
  const selectedBranchName =
    procurementBranches.find((branch) => branch.id === branchId)?.name ??
    (branchId ? `#${branchId}` : GRN_CREATE_COPY.branchUnselected);

  const warehouseField = (
    <div className="flex flex-col gap-1.5">
      <Label className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {messages.inventory.grn.receivingWarehouse}
      </Label>
      {procurementBranches.length > 0 ? (
        <Select
          value={branchId != null ? String(branchId) : ""}
          onValueChange={(v) => setBranchId(Number(v) || null)}
          disabled={!showWarehousePicker || branchLocked}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {procurementBranches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm font-medium">{selectedBranchName}</p>
      )}
    </div>
  );

  const documentSummary = (
    <AppSection
      size="sm"
      title={messages.inventory.grn.documentLabel}
      action={
        showWarehouseEditor ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size={embedded ? "touch" : "sm"}
              >
                {ACTIONS_VI.edit}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-dvh-95 p-0">
              <SheetHeader>
                <SheetTitle>{messages.inventory.grn.receivingWarehouse}</SheetTitle>
              </SheetHeader>
              <div className="px-3 py-3 sm:px-4">{warehouseField}</div>
              <SheetFooter>
                <Button type="button" size="touch-lg" asChild>
                  <SheetClose>{ACTIONS_VI.close}</SheetClose>
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {messages.inventory.grn.supplier}
          </p>
          <p className="truncate text-sm font-semibold">{supplier.name}</p>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {messages.inventory.grn.receivingWarehouse}
          </p>
          <p className="truncate text-sm font-semibold">{selectedBranchName}</p>
        </div>
      </div>
    </AppSection>
  );

  const listColumn = (
    <>
      {documentSummary}
      {lineCount > 0 ? (
        <AppSection size="sm" contentClassName="gap-2">
          <div className="flex items-center justify-between text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{GRN_CREATE_COPY.addedSummary(lineCount)}</span>
            <span className="text-foreground">
              {GRN_CREATE_COPY.moneyVnd(total)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {draft.lines.map((line) => (
              <div
                key={line.ingredientId}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {line.ingredientName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {GRN_CREATE_COPY.lineUnitCost(
                      line.quantity,
                      line.unit,
                      line.unitCost,
                    )}{" "}
                    <span className="font-medium text-foreground">
                      {GRN_CREATE_COPY.moneyVnd(line.quantity * line.unitCost)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    onClick={() => {
                      const ingredient = ingredients.find(
                        (i) => i.id === line.ingredientId,
                      );
                      if (ingredient) openEdit(ingredient);
                    }}
                    aria-label={GRN_CREATE_COPY.editLineAria}
                  >
                    <IconPencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeLine(line.ingredientId)}
                    aria-label={GRN_CREATE_COPY.deleteLineAria}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </AppSection>
      ) : null}

      <InputGroup className="h-12 rounded-lg">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={GRN_CREATE_COPY.searchPlaceholder}
          className="text-base"
          inputMode="search"
        />
      </InputGroup>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <AppEmptyState
            compact
            icon={<IconSearch />}
            title={GRN_CREATE_COPY.emptyTitle}
            description={GRN_CREATE_COPY.emptyDescription}
          />
        ) : (
          filtered.map((ingredient) => {
            const added = addedMap.has(ingredient.id);
            return (
              <button
                key={ingredient.id}
                type="button"
                onClick={() => openEdit(ingredient)}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition hover:bg-accent/10 active:scale-[0.99]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-2xs font-bold uppercase text-muted-foreground">
                  {(ingredient.sku ?? ingredient.name).slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {ingredient.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ingredient.sku ? `${ingredient.sku} · ` : ""}
                    {ingredient.unit}
                    {ingredient.unit_cost
                      ? ` · ~${formatVND(Number(ingredient.unit_cost))} đ`
                      : ""}
                  </p>
                </div>
                {added ? (
                  <IconCircleCheck className="size-5 shrink-0 text-success" />
                ) : (
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })
        )}
      </div>

      {submitError ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  const header = (
    <AppPageHeader
      breadcrumb={
        <Link
          href={basePath}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <IconArrowLeft className="size-4" /> {GRN_CREATE_COPY.changeSupplier}
        </Link>
      }
      eyebrow={GRN_CREATE_COPY.newReceiptEyebrow}
      title={supplier.name}
      description={GRN_CREATE_COPY.newReceiptDescription}
      actions={
        lineCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={discardDraft}
          >
            <IconTrash className="size-4" />
            {GRN_CREATE_COPY.discardDraft}
          </Button>
        ) : undefined
      }
    />
  );

  const body = (
    <>
      {/* Desktop (lg+, non-embedded office surface): ingredient/line list +
          line-edit panel side by side. The embedded branch root and smaller
          viewports stay single-column, editing a line through LineEditSheet. */}
      {embedded ? (
        listColumn
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
          <div className="flex flex-col gap-3">{listColumn}</div>
          <div className="hidden lg:block">
            <LineEditPanel
              edit={edit}
              onClose={closeEdit}
              onSave={saveLine}
              onRemove={() => {
                if (!edit) return;
                removeLine(edit.ingredient.id);
                closeEdit();
              }}
              onPatch={(patch) =>
                setEdit((current) =>
                  current ? { ...current, ...patch } : current,
                )
              }
            />
          </div>
        </div>
      )}

      <LineEditSheet
        edit={isDesktopLineEdit ? null : edit}
        onClose={closeEdit}
        onSave={saveLine}
        onRemove={() => {
          if (!edit) return;
          removeLine(edit.ingredient.id);
          closeEdit();
        }}
        onPatch={(patch) =>
          setEdit((current) => (current ? { ...current, ...patch } : current))
        }
        onOpenNumpad={setNumpad}
      />

      <NumberPadSheet
        open={numpad === "qty"}
        onOpenChange={(next) => setNumpad(next ? "qty" : null)}
        title={GRN_CREATE_COPY.labelQuantity(edit?.unit ?? "")}
        initialValue={edit?.quantity ?? 0}
        suffix={edit?.unit ?? ""}
        onConfirm={(value) =>
          setEdit((current) =>
            current ? { ...current, quantity: value } : current,
          )
        }
        allowDecimal
      />
      <NumberPadSheet
        open={numpad === "cost"}
        onOpenChange={(next) => setNumpad(next ? "cost" : null)}
        title={GRN_CREATE_COPY.unitCostTitle}
        initialValue={edit?.unitCost ?? 0}
        suffix={GRN_CREATE_COPY.currencySuffix}
        onConfirm={(value) =>
          setEdit((current) =>
            current ? { ...current, unitCost: value } : current,
          )
        }
        allowDecimal={false}
      />
    </>
  );

  const footer = (
    <AppDetailFooter
      sticky={embedded}
      className={embedded ? undefined : "border-0 p-0 shadow-none"}
      trailing={
        <Button
          type="button"
          size="touch-lg"
          onClick={submit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <>
              <Spinner className="size-5" />
              {STATES_VI.saving}
            </>
          ) : lineCount === 0 ? (
            GRN_CREATE_COPY.addItemToContinue
          ) : (
            GRN_CREATE_COPY.saveDraft(lineCount, total)
          )}
        </Button>
      }
    />
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        {body}
        {footer}
      </div>
    );
  }

  return (
    <DocumentFormFrame header={header} width="wide" footer={footer}>
      {body}
    </DocumentFormFrame>
  );
}

type LineEditSheetProps = {
  edit: EditState | null;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<EditState>) => void;
  onOpenNumpad: (key: "qty" | "cost") => void;
};

// Shared field body for the GRN line editor: the mobile bottom LineEditSheet
// and the desktop docked LineEditPanel both render this, so there is exactly
// one line-edit fields tree (not a hidden/duplicated twin per breakpoint).
function LineEditFields({
  edit,
  onPatch,
  onOpenNumpad,
}: {
  edit: EditState;
  onPatch: (patch: Partial<EditState>) => void;
  onOpenNumpad?: (key: "qty" | "cost") => void;
}) {
  const referenceCost = edit.ingredient.unit_cost
    ? Number(edit.ingredient.unit_cost)
    : null;
  const variance =
    referenceCost && referenceCost > 0
      ? (edit.unitCost - referenceCost) / referenceCost
      : null;
  const showVarianceWarning =
    variance != null && Math.abs(variance) > DEFAULT_VARIANCE_WARNING;
  const lineTotal = edit.quantity * edit.unitCost;

  return (
    <div className="flex flex-col gap-3">
      <UnitField
        options={getPurchaseUnitOptions(edit.ingredient)}
        entryUnitId={edit.entryUnitId}
        unit={edit.unit}
        onUnitChange={(unitId, label) =>
          onPatch({ entryUnitId: unitId, unit: label })
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <LineValueField
          label={FORM_VI.quantity}
          display={edit.quantity}
          detail={edit.unit}
          onOpenNumpad={() => onOpenNumpad?.("qty")}
        >
          <QuantityInput
            value={String(edit.quantity)}
            onValueChange={(v) => onPatch({ quantity: Number(v) || 0 })}
            maxFractionDigits={3}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className="h-auto border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0"
          />
        </LineValueField>
        <LineValueField
          label={FORM_VI.unitPrice}
          display={formatVND(edit.unitCost)}
          detail={GRN_CREATE_COPY.unitPriceUnit(edit.unit)}
          onOpenNumpad={() => onOpenNumpad?.("cost")}
        >
          <MoneyVndInput
            value={String(edit.unitCost)}
            onValueChange={(v) => onPatch({ unitCost: Number(v) || 0 })}
            onFocus={(e) => e.currentTarget.select()}
            className="h-auto border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0"
          />
        </LineValueField>
      </div>

      <div className="rounded-md bg-muted/50 px-3 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{FORM_VI.amount}</span>
          <span className="text-base font-semibold">
            {GRN_CREATE_COPY.moneyVnd(lineTotal)}
          </span>
        </div>
        {referenceCost ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {GRN_CREATE_COPY.lastCost(referenceCost, edit.unit)}
          </p>
        ) : null}
      </div>

      {showVarianceWarning && variance != null ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription>
            {GRN_CREATE_COPY.varianceWarning(variance)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Label
          htmlFor="line-note"
          className="text-2xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {GRN_CREATE_COPY.optionalNote}
        </Label>
        <Textarea
          id="line-note"
          value={edit.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          rows={2}
          maxLength={200}
          placeholder={GRN_CREATE_COPY.notePlaceholder}
          className="mt-1"
        />
      </div>
    </div>
  );
}

function LineEditSheet({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onOpenNumpad,
}: LineEditSheetProps) {
  const open = edit != null;
  const valid = edit != null && edit.quantity > 0 && edit.unitCost >= 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-0 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {edit ? (
          <>
            <SheetHeader>
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                {edit.line ? GRN_CREATE_COPY.editItem : GRN_CREATE_COPY.addItem}
              </p>
              <SheetTitle className="text-lg font-semibold">
                {edit.ingredient.name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                {edit.ingredient.sku ? `${edit.ingredient.sku} · ` : ""}
                {GRN_CREATE_COPY.unitLabel(edit.unit)}
              </p>
            </SheetHeader>

            <div className="p-4">
              <LineEditFields
                edit={edit}
                onPatch={onPatch}
                onOpenNumpad={onOpenNumpad}
              />
            </div>

            <SheetFooter>
              <Button
                type="button"
                size="touch-lg"
                className="w-full"
                onClick={onSave}
                disabled={!valid}
              >
                {edit.line ? "Cập nhật" : "Thêm vào phiếu"}
              </Button>
              <div className="flex items-center gap-2">
                {edit.line ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="touch-lg"
                    onClick={onRemove}
                    className="flex-1"
                  >
                    {ACTIONS_VI.delete}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="touch-lg"
                  onClick={onClose}
                  className="flex-1"
                >
                  {ACTIONS_VI.close}
                </Button>
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// Desktop (lg+) docked line-edit panel: same LineEditFields tree as the
// mobile sheet, framed by AppSection instead of a bottom Sheet. Shows an
// empty prompt when no line is selected.
function LineEditPanel({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
}: Omit<LineEditSheetProps, "onOpenNumpad">) {
  const valid = edit != null && edit.quantity > 0 && edit.unitCost >= 0;

  if (!edit) {
    return (
      <AppSection contentClassName="items-center justify-center py-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {GRN_CREATE_COPY.panelEmptyTitle}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {GRN_CREATE_COPY.panelEmptyDescription}
        </p>
      </AppSection>
    );
  }

  return (
    <AppSection
      title={edit.ingredient.name}
      description={
        edit.ingredient.sku
          ? `${edit.ingredient.sku} · ${GRN_CREATE_COPY.unitLabel(edit.unit)}`
          : GRN_CREATE_COPY.unitLabel(edit.unit)
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={onSave}
            disabled={!valid}
          >
            {edit.line ? "Cập nhật" : "Thêm vào phiếu"}
          </Button>
          <div className="flex items-center gap-2">
            {edit.line ? (
              <Button
                type="button"
                variant="destructive"
                onClick={onRemove}
                className="flex-1"
              >
                {ACTIONS_VI.delete}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              {ACTIONS_VI.close}
            </Button>
          </div>
        </div>
      }
    >
      <LineEditFields edit={edit} onPatch={onPatch} />
    </AppSection>
  );
}

function LineValueField({
  label,
  display,
  detail,
  onOpenNumpad,
  children,
}: {
  label: string;
  display: React.ReactNode;
  detail: React.ReactNode;
  onOpenNumpad: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenNumpad}
        className="flex flex-col items-start gap-1 rounded-md border bg-card px-3 py-3 text-left transition active:scale-[0.99] md:hidden"
      >
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-2xl font-semibold tabular-nums">{display}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </button>
      <label className="hidden cursor-text flex-col items-start gap-1 rounded-md border bg-card px-3 py-3 text-left transition focus-within:ring-2 focus-within:ring-foreground md:flex">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {children}
        <span className="text-xs text-muted-foreground">{detail}</span>
      </label>
    </>
  );
}

// Unit picker for the GRN line, matching the PO create flow's UnitField.
function UnitField({
  options,
  entryUnitId,
  unit,
  onUnitChange,
}: {
  options: PurchaseUnitOption[];
  entryUnitId: number | null;
  unit: string;
  onUnitChange: (unitId: number, label: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {messages.inventory.grn.addDialog.unitLabel}
      </Label>
      {options.length > 0 ? (
        <Select
          value={entryUnitId != null ? String(entryUnitId) : ""}
          onValueChange={(value) => {
            const opt = options.find((o) => String(o.unitId) === value);
            if (opt) onUnitChange(opt.unitId, opt.label);
          }}
        >
          <SelectTrigger size="touch" className="w-full" aria-label={unit}>
            <SelectValue
              placeholder={messages.inventory.grn.addDialog.selectUnit}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.unitId} value={String(o.unitId)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select disabled value="">
          <SelectTrigger size="touch" className="w-full" aria-label={unit}>
            <SelectValue
              placeholder={messages.inventory.grn.addDialog.selectUnit}
            />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )}
    </div>
  );
}

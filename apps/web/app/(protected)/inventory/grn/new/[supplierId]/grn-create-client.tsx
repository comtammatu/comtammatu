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
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { MoneyVndInput, NumberPadSheet, QuantityInput } from "@/components/form";
import { matchesSearch } from "@lib/search";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { AppEmptyState, AppPage, AppPageHeader, AppSection } from "@/components/surface";
import {
  draftTotal,
  type GrnDraft,
  type GrnDraftLine,
} from "../../../_lib/grn-draft";
import { formatVND } from "../../../_lib/format";
import {
  createGrnDraft,
  deleteGrnLine,
  discardGrnDraft,
  upsertGrnLine,
} from "../../../grn-actions";

import { ACTIONS_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number | null;
  category: string | null;
};

type ServerDraftLine = GrnDraftLine & { lineId: number };

type Props = {
  supplier: { id: number; name: string };
  branchId: number | null;
  ingredients: Ingredient[];
  existingDraft: { id: number; lines: ServerDraftLine[] } | null;
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
  optionalNote: "Ghi chú (tùy chọn)",
  notePlaceholder: "Tình trạng, lô, nhiệt độ...",
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
};

type EditState = {
  ingredient: Ingredient;
  line: GrnDraftLine | null;
  quantity: number;
  unitCost: number;
  note: string;
};

export function GrnCreateClient({
  supplier,
  branchId,
  ingredients,
  existingDraft,
}: Props) {
  const router = useRouter();
  // Sprint 6 #3: server-side draft is the source of truth. React state mirrors
  // server state for UI rendering; lazy-create on first saveLine when no
  // draft exists yet.
  const [draft, setDraft] = React.useState<GrnDraft>(() => ({
    draftId: existingDraft
      ? `srv-${existingDraft.id}`
      : `pending-${supplier.id}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    branchId,
    lines: existingDraft?.lines ?? [],
    updatedAt: new Date().toISOString(),
  }));
  const [serverGrnId, setServerGrnId] = React.useState<number | null>(
    existingDraft?.id ?? null,
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
      setSubmitError("Chưa có kho nhận hàng cho phiếu nhập.");
      return null;
    }
    const created = await createGrnDraft({
      supplierId: supplier.id,
      branchId,
    });
    if (!created.success) {
      setSubmitError(created.error ?? "Không thể tạo phiếu nháp.");
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
    setEdit({
      ingredient,
      line: existing ?? null,
      quantity: existing?.quantity ?? 0,
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
        unit: edit.ingredient.unit,
        unitCost: edit.unitCost,
        qualityStatus: "accepted",
      });
      if (!lineRes.success) {
        setSubmitError(lineRes.error ?? "Không lưu được dòng.");
        return;
      }
      const lineId = (lineRes.data as { id: number } | undefined)?.id ?? 0;
      const nextLine: GrnDraftLine & { lineId?: number } = {
        ingredientId: edit.ingredient.id,
        ingredientName: edit.ingredient.name,
        unit: edit.ingredient.unit,
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
        setSubmitError(res.error ?? "Không xóa được dòng.");
        return;
      }
    }
    applyLines(draft.lines.filter((l) => l.ingredientId !== ingredientId));
  }

  async function discardDraft() {
    const ok = await confirm({
      title: "Xóa phiếu nháp này?",
      description: "Các dòng đã nhập sẽ mất.",
      variant: "destructive",
    });
    if (!ok) return;
    if (serverGrnId !== null) {
      const res = await discardGrnDraft({ grnId: serverGrnId });
      if (!res.success) {
        setSubmitError(res.error ?? "Không thể hủy phiếu nháp.");
        return;
      }
    }
    router.push("/inventory/grn/new");
  }

  async function submit() {
    if (draft.lines.length === 0) {
      setSubmitError("Phiếu chưa có dòng nào.");
      return;
    }
    if (!branchId) {
      setSubmitError("Chưa có kho nhận hàng cho phiếu nhập.");
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
      router.push(`/inventory/grn/${grnId}?review=1`);
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

  return (
    <AppPage width="narrow">
      <AppPageHeader
        breadcrumb={
          <Link
            href="/inventory/grn/new"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {GRN_CREATE_COPY.changeSupplier}
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
                className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
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
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition hover:bg-accent/40 active:scale-[0.99]"
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

      <div className="sticky chrome-safe-bottom z-10">
        <Button
          type="button"
          size="touch-lg"
          className="w-full"
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
      </div>

      <LineEditSheet
        edit={edit}
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
        title={`Số lượng (${edit?.ingredient.unit ?? ""})`}
        initialValue={edit?.quantity ?? 0}
        suffix={edit?.ingredient.unit ?? ""}
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
        suffix="đ"
        onConfirm={(value) =>
          setEdit((current) =>
            current ? { ...current, unitCost: value } : current,
          )
        }
        allowDecimal={false}
      />
    </AppPage>
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

function LineEditSheet({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onOpenNumpad,
}: LineEditSheetProps) {
  const open = edit != null;
  const referenceCost = edit?.ingredient.unit_cost
    ? Number(edit.ingredient.unit_cost)
    : null;
  const variance =
    referenceCost && referenceCost > 0 && edit
      ? (edit.unitCost - referenceCost) / referenceCost
      : null;
  const showVarianceWarning =
    variance != null && Math.abs(variance) > DEFAULT_VARIANCE_WARNING;
  const lineTotal = edit ? edit.quantity * edit.unitCost : 0;
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
                {GRN_CREATE_COPY.unitLabel(edit.ingredient.unit)}
              </p>
            </SheetHeader>

            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <LineValueField
                  label={FORM_VI.quantity}
                  display={edit.quantity}
                  detail={edit.ingredient.unit}
                  onOpenNumpad={() => onOpenNumpad("qty")}
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
                  detail={GRN_CREATE_COPY.unitPriceUnit(edit.ingredient.unit)}
                  onOpenNumpad={() => onOpenNumpad("cost")}
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
                  <span className="text-muted-foreground">
                    {FORM_VI.amount}
                  </span>
                  <span className="text-base font-semibold">
                    {GRN_CREATE_COPY.moneyVnd(lineTotal)}
                  </span>
                </div>
                {referenceCost ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {GRN_CREATE_COPY.lastCost(
                      referenceCost,
                      edit.ingredient.unit,
                    )}
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

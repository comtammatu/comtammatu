"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { Input } from "@comtammatu/ui/components/input";
import { Card } from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { MobilePage } from "../../../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../../../_components/mobile/mobile-section-header";
import { MobileEmptyState } from "../../../../_components/mobile/mobile-empty-state";
import { TouchButton } from "../../../../_components/mobile/touch-button";
import { NumberPadSheet } from "../../../../_components/mobile/number-pad-sheet";
import {
  createEmptyDraft,
  draftTotal,
  loadDraft,
  removeDraft,
  saveDraft,
  type GrnDraft,
  type GrnDraftLine,
} from "../../../../_lib/mobile-draft";
import { formatVND } from "../../../../_lib/format";
import {
  createGrnDraft,
  upsertGrnLine,
  confirmGrn,
} from "../../../../grn-actions";

type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number | null;
  category: string | null;
};

type Props = {
  userKey: string;
  supplier: { id: number; name: string };
  branchId: number | null;
  ingredients: Ingredient[];
};

const DEFAULT_VARIANCE_WARNING = 0.2;

type EditState = {
  ingredient: Ingredient;
  line: GrnDraftLine | null;
  quantity: number;
  unitCost: number;
  note: string;
};

export function GrnCreateClient({
  userKey,
  supplier,
  branchId,
  ingredients,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<GrnDraft | null>(null);
  const [query, setQuery] = React.useState("");
  const [edit, setEdit] = React.useState<EditState | null>(null);
  const [numpad, setNumpad] = React.useState<"qty" | "cost" | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storageKey = `active-grn:${userKey}:${supplier.id}`;
    let activeDraft: GrnDraft | null = null;
    try {
      const existingId = window.localStorage.getItem(storageKey);
      if (existingId) {
        const loaded = loadDraft(userKey, existingId);
        if (loaded && loaded.supplierId === supplier.id) {
          activeDraft = loaded;
        }
      }
    } catch {
      /* ignore */
    }
    if (!activeDraft) {
      activeDraft = createEmptyDraft(supplier.id, supplier.name, branchId);
      saveDraft(userKey, activeDraft);
    }
    try {
      window.localStorage.setItem(storageKey, activeDraft.draftId);
    } catch {
      /* ignore */
    }
    setDraft(activeDraft);
  }, [userKey, supplier.id, supplier.name, branchId]);

  const addedMap = React.useMemo(() => {
    const map = new Map<number, GrnDraftLine>();
    draft?.lines.forEach((line) => map.set(line.ingredientId, line));
    return map;
  }, [draft]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ingredients;
    return ingredients.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.sku ?? "").toLowerCase().includes(needle),
    );
  }, [query, ingredients]);

  function updateDraftLines(nextLines: GrnDraftLine[]) {
    if (!draft) return;
    const next: GrnDraft = { ...draft, lines: nextLines };
    saveDraft(userKey, next);
    setDraft(next);
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

  function saveLine() {
    if (!edit || !draft) return;
    if (edit.quantity <= 0 || edit.unitCost < 0) return;
    const nextLine: GrnDraftLine = {
      ingredientId: edit.ingredient.id,
      ingredientName: edit.ingredient.name,
      unit: edit.ingredient.unit,
      quantity: edit.quantity,
      unitCost: edit.unitCost,
      note: edit.note.trim() ? edit.note.trim() : undefined,
    };
    const idx = draft.lines.findIndex(
      (l) => l.ingredientId === edit.ingredient.id,
    );
    const nextLines =
      idx >= 0
        ? draft.lines.map((l, i) => (i === idx ? nextLine : l))
        : [...draft.lines, nextLine];
    updateDraftLines(nextLines);
    closeEdit();
  }

  function removeLine(ingredientId: number) {
    if (!draft) return;
    updateDraftLines(
      draft.lines.filter((l) => l.ingredientId !== ingredientId),
    );
  }

  function discardDraft() {
    if (!draft) return;
    if (!window.confirm("Xóa phiếu nháp này? Các dòng đã nhập sẽ mất.")) return;
    removeDraft(userKey, draft.draftId);
    try {
      window.localStorage.removeItem(
        `active-grn:${userKey}:${supplier.id}`,
      );
    } catch {
      /* ignore */
    }
    router.push("/inventory/m/grn");
  }

  async function submit() {
    if (!draft || draft.lines.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const createRes = await createGrnDraft({
        supplierId: supplier.id,
        branchId: branchId ?? undefined,
      });
      if (!createRes.success) {
        setSubmitError(createRes.error ?? "Không thể tạo phiếu nhập.");
        return;
      }
      const grn = createRes.data as { id: number } | undefined;
      if (!grn?.id) {
        setSubmitError("Không thể tạo phiếu nhập.");
        return;
      }
      for (const line of draft.lines) {
        const lineRes = await upsertGrnLine({
          grnId: grn.id,
          ingredientId: line.ingredientId,
          receivedQuantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          qualityStatus: "accepted",
        });
        if (!lineRes.success) {
          setSubmitError(
            lineRes.error ??
              `Không lưu được dòng ${line.ingredientName}. Phiếu đã lưu nháp.`,
          );
          return;
        }
      }
      const confirmRes = await confirmGrn(grn.id);
      if (!confirmRes.success) {
        setSubmitError(
          confirmRes.error ??
            "Đã lưu phiếu nhưng chưa xác nhận được. Vào chi tiết để hoàn tất.",
        );
        return;
      }
      removeDraft(userKey, draft.draftId);
      try {
        window.localStorage.removeItem(`active-grn:${userKey}:${supplier.id}`);
      } catch {
        /* ignore */
      }
      router.push(`/inventory/grn/${grn.id}?m=1`);
      router.refresh();
    } catch (err) {
      console.error("submit GRN", err);
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Không thể gửi phiếu. Vui lòng thử lại.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) {
    return (
      <MobilePage>
        <MobileSectionHeader
          backHref="/inventory/m/grn"
          backLabel="Đổi nhà cung cấp"
          eyebrow={supplier.name}
          title="Đang chuẩn bị..."
        />
      </MobilePage>
    );
  }

  const total = draftTotal(draft);
  const lineCount = draft.lines.length;
  const canSubmit = lineCount > 0 && !submitting;

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m/grn"
        backLabel="Đổi nhà cung cấp"
        eyebrow="Phiếu nhập mới"
        title={supplier.name}
        description="Thêm nguyên liệu rồi xác nhận phiếu."
        action={
          lineCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={discardDraft}
            >
              <Trash2 className="size-4" />
              Hủy nháp
            </Button>
          ) : undefined
        }
      />

      {lineCount > 0 ? (
        <Card className="gap-2 p-3">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Đã thêm {lineCount} mặt hàng</span>
            <span className="text-foreground">{formatVND(total)} đ</span>
          </div>
          <div className="flex flex-col gap-2">
            {draft.lines.map((line) => (
              <div
                key={line.ingredientId}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {line.ingredientName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {line.quantity} {line.unit} ·{" "}
                    {formatVND(line.unitCost)} đ/{line.unit} ·{" "}
                    <span className="font-medium text-foreground">
                      {formatVND(line.quantity * line.unitCost)} đ
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="size-9"
                    onClick={() => {
                      const ingredient = ingredients.find(
                        (i) => i.id === line.ingredientId,
                      );
                      if (ingredient) openEdit(ingredient);
                    }}
                    aria-label="Sửa dòng"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="size-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeLine(line.ingredientId)}
                    aria-label="Xóa dòng"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc mã SKU"
          className="h-12 rounded-lg pl-9 text-base"
          inputMode="search"
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <MobileEmptyState
            icon={Search}
            title="Không thấy nguyên liệu"
            description="Thử từ khóa khác hoặc kiểm tra lại danh mục."
          />
        ) : (
          filtered.map((ingredient) => {
            const added = addedMap.has(ingredient.id);
            return (
              <button
                key={ingredient.id}
                type="button"
                onClick={() => openEdit(ingredient)}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition hover:bg-accent/40 active:scale-[0.99]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold uppercase text-muted-foreground">
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
                  <CheckCircle2 className="size-5 shrink-0 text-success" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })
        )}
      </div>

      {submitError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-4 z-10">
        <TouchButton
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="shadow-lg"
        >
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Đang gửi...
            </>
          ) : lineCount === 0 ? (
            "Thêm mặt hàng để tiếp tục"
          ) : (
            <>
              Xác nhận nhập {lineCount} mặt hàng · {formatVND(total)} đ
            </>
          )}
        </TouchButton>
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
        title="Đơn giá nhập"
        initialValue={edit?.unitCost ?? 0}
        suffix="đ"
        onConfirm={(value) =>
          setEdit((current) =>
            current ? { ...current, unitCost: value } : current,
          )
        }
        allowDecimal={false}
      />
    </MobilePage>
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
        className="h-auto max-h-[95dvh] gap-0 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {edit ? (
          <>
            <SheetHeader className="border-b p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {edit.line ? "Sửa mặt hàng" : "Thêm mặt hàng"}
              </p>
              <SheetTitle className="text-lg font-semibold">
                {edit.ingredient.name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                {edit.ingredient.sku ? `${edit.ingredient.sku} · ` : ""}
                Đơn vị: {edit.ingredient.unit}
              </p>
            </SheetHeader>

            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onOpenNumpad("qty")}
                  className="flex flex-col items-start gap-1 rounded-xl border bg-card px-3 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Số lượng
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {edit.quantity}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {edit.ingredient.unit}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenNumpad("cost")}
                  className="flex flex-col items-start gap-1 rounded-xl border bg-card px-3 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Đơn giá
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatVND(edit.unitCost)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    đ / {edit.ingredient.unit}
                  </span>
                </button>
              </div>

              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Thành tiền</span>
                  <span className="text-base font-semibold">
                    {formatVND(lineTotal)} đ
                  </span>
                </div>
                {referenceCost ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Giá gần nhất: {formatVND(referenceCost)} đ/
                    {edit.ingredient.unit}
                  </p>
                ) : null}
              </div>

              {showVarianceWarning && variance != null ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    Giá chênh {(variance * 100).toFixed(0)}% so với lần trước —
                    kiểm tra lại trước khi lưu.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div>
                <label
                  htmlFor="line-note"
                  className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Ghi chú (tùy chọn)
                </label>
                <textarea
                  id="line-note"
                  value={edit.note}
                  onChange={(e) => onPatch({ note: e.target.value })}
                  rows={2}
                  maxLength={200}
                  placeholder="Tình trạng, lô, nhiệt độ..."
                  className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
            </div>

            <SheetFooter className="flex flex-col gap-2 border-t p-3">
              <TouchButton type="button" onClick={onSave} disabled={!valid}>
                {edit.line ? "Cập nhật" : "Thêm vào phiếu"}
              </TouchButton>
              <div className="flex items-center gap-2">
                {edit.line ? (
                  <TouchButton
                    type="button"
                    variant="destructive"
                    onClick={onRemove}
                    className="flex-1"
                  >
                    Xóa
                  </TouchButton>
                ) : null}
                <TouchButton
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  Đóng
                </TouchButton>
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

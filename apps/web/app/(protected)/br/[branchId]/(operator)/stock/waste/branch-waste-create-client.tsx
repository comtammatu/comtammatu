/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  CirclePlus as IconCirclePlus,
  PackageMinus as IconPackageMinus,
  Trash2 as IconTrash,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { Combobox } from "@/components/form/combobox";
import { FormField } from "@/components/form/form-field";
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  newWasteLine,
  previewWasteTier,
  type WasteFormContext,
  type WasteLineState,
  type WasteRollingStatus,
} from "@lib/inventory/waste-create-model";
import { messages } from "@lib/messages";
import { WasteReasonDropdown } from "@/(protected)/inventory/_components/waste-reason-dropdown";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { WastePhotoUpload } from "@/(protected)/inventory/_components/waste-photo-upload";
import { ShiftCapMeter } from "@/(protected)/inventory/_components/shift-cap-meter";
import { BranchDailyCapBanner } from "@/(protected)/inventory/_components/branch-daily-cap-banner";
import { AntiSplitRollingMeter } from "@/(protected)/inventory/_components/anti-split-rolling-meter";
import { createWasteEntry } from "@/(protected)/inventory/waste-actions";
import { formatQty } from "@lib/inventory/format";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
} from "@/(protected)/inventory/_lib/issue-units";

const wasteCopy = messages.inventory.waste;

type WasteEditor = {
  line: WasteLineState;
  isNew: boolean;
};

function cloneWasteLine(line: WasteLineState): WasteLineState {
  return { ...line, photoUrls: [...line.photoUrls] };
}

export function BranchWasteCreateClient({
  branchId,
  branchName,
  canCreateWaste,
  loadFailed,
  context,
}: {
  branchId: number;
  branchName: string;
  canCreateWaste: boolean;
  loadFailed: boolean;
  context: WasteFormContext | null;
}) {
  const router = useRouter();
  const stockBasePath = `/br/${branchId}/stock`;
  const nextLineId = useRef(1);
  const [locationId, setLocationId] = useState<number | null>(
    context?.locations[0]?.id ?? null,
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<WasteLineState[]>([]);
  const [editor, setEditor] = useState<WasteEditor | null>(null);
  const [rollingStatus, setRollingStatus] = useState<WasteRollingStatus | null>(
    null,
  );
  const [forcePhotoLineUids, setForcePhotoLineUids] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSubmitting, startSubmit] = useTransition();
  const hasDraftChanges =
    lines.length > 0 || notes.trim().length > 0 || editor !== null;

  const ingredientOptions = useMemo(
    () =>
      (context?.ingredients ?? []).map((ingredient) => ({
        value: String(ingredient.id),
        label: `${ingredient.name} (${ingredient.unit})`,
      })),
    [context?.ingredients],
  );
  const ingredientById = useMemo(() => {
    const ingredients = new Map<
      number,
      WasteFormContext["ingredients"][number]
    >();
    for (const ingredient of context?.ingredients ?? []) {
      ingredients.set(ingredient.id, ingredient);
    }
    return ingredients;
  }, [context?.ingredients]);

  const resolveLocationStock = useCallback(
    (
      ingredient: WasteFormContext["ingredients"][number],
      targetLocationId: number | null,
    ) => {
      if (targetLocationId === null) return null;
      return (
        ingredient.stockLevels.find(
          (level) => level.locationId === targetLocationId,
        ) ?? null
      );
    },
    [],
  );

  const getLineBaseQuantity = useCallback(
    (
      line: WasteLineState,
      ingredient: WasteFormContext["ingredients"][number] | null | undefined,
    ) => {
      const issueUnit = ingredient?.issueUnits.find(
        (unit) => String(unit.unitId) === line.entryUnitId,
      );
      return getIssueBaseQuantity(Number(line.quantity) || 0, issueUnit);
    },
    [],
  );

  const getLineValue = useCallback(
    (
      line: WasteLineState,
      ingredient: WasteFormContext["ingredients"][number] | null | undefined,
    ) => getLineBaseQuantity(line, ingredient) * (Number(line.unitCost) || 0),
    [getLineBaseQuantity],
  );

  const totalValue = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          getLineValue(
            line,
            line.ingredientId === null
              ? null
              : ingredientById.get(line.ingredientId),
          ),
        0,
      ),
    [getLineValue, ingredientById, lines],
  );

  const editorDetails = useMemo(() => {
    if (!editor || !context) return null;

    const selectedIngredient =
      editor.line.ingredientId === null
        ? null
        : (ingredientById.get(editor.line.ingredientId) ?? null);
    const selectedUnit = selectedIngredient?.issueUnits.find(
      (unit) => String(unit.unitId) === editor.line.entryUnitId,
    );
    const locationStock = selectedIngredient
      ? resolveLocationStock(selectedIngredient, locationId)
      : null;
    const availableQuantity = Number(locationStock?.quantity ?? 0);
    const baseQuantity = getLineBaseQuantity(editor.line, selectedIngredient);
    const value = getLineValue(editor.line, selectedIngredient);
    const existingValue = editor.isNew
      ? 0
      : (lines.find((line) => line.uid === editor.line.uid) ?? null);
    const priorValue = existingValue
      ? getLineValue(
          existingValue,
          existingValue.ingredientId === null
            ? null
            : ingredientById.get(existingValue.ingredientId),
        )
      : 0;
    const projectedTotalValue = totalValue - priorValue + value;
    const editorIngredientId = editor.line.ingredientId;
    const pendingIngredientValue =
      editorIngredientId === null
        ? value
        : lines.reduce((sum, line) => {
            if (
              line.uid === editor.line.uid ||
              line.ingredientId === null ||
              line.ingredientId !== editorIngredientId
            ) {
              return sum;
            }
            return (
              sum + getLineValue(line, ingredientById.get(line.ingredientId))
            );
          }, 0) + value;
    const preview = previewWasteTier({
      value,
      baseQuantity,
      availableQuantity,
      reasonCode: editor.line.reasonCode,
      projectedShiftSum: context.capStatus.shiftSum + projectedTotalValue,
      projectedBranchSum: context.capStatus.branchToday + projectedTotalValue,
      branchCap: context.capStatus.branchCap,
      rollingSum: rollingStatus?.rollingSum ?? null,
      pendingIngredientValue,
    });

    return {
      selectedIngredient,
      selectedUnit,
      locationStock,
      availableQuantity,
      baseQuantity,
      value,
      preview,
      maxEntryQuantity: getIssueMaxEntryQuantity(
        availableQuantity,
        selectedUnit,
      ),
    };
  }, [
    context,
    editor,
    getLineBaseQuantity,
    getLineValue,
    ingredientById,
    lines,
    locationId,
    resolveLocationStock,
    rollingStatus,
    totalValue,
  ]);

  useEffect(() => {
    if (!hasDraftChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDraftChanges]);

  if (!canCreateWaste) {
    return (
      <BranchOperatorPage
        title={wasteCopy.title}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-access"
          icon={<IconPackageMinus />}
          title="Không có quyền ghi hao hụt"
          description="Tài khoản này không được tạo phiếu hao hụt tại chi nhánh này."
        />
      </BranchOperatorPage>
    );
  }

  if (loadFailed || !context) {
    return (
      <BranchOperatorPage
        title={wasteCopy.title}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-data"
          icon={<IconPackageMinus />}
          title="Không tải được phiếu hao hụt"
          description="Hãy tải lại để lấy vị trí kho và nguyên liệu hiện tại."
        >
          <Button type="button" size="touch" onClick={() => router.refresh()}>
            Tải lại
          </Button>
        </AppEmptyState>
      </BranchOperatorPage>
    );
  }

  if (context.locations.length === 0 || context.ingredients.length === 0) {
    const noLocation = context.locations.length === 0;
    return (
      <BranchOperatorPage
        title={wasteCopy.title}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-data"
          icon={<IconPackageMinus />}
          title={noLocation ? "Chưa có vị trí kho" : "Chưa có nguyên liệu"}
          description={
            noLocation
              ? "Chi nhánh cần có ít nhất một vị trí kho đang hoạt động trước khi ghi hao hụt."
              : "Chưa có nguyên liệu đang hoạt động để tạo phiếu hao hụt."
          }
        />
      </BranchOperatorPage>
    );
  }

  function patchEditor(patch: Partial<WasteLineState>) {
    setEditor((current) =>
      current ? { ...current, line: { ...current.line, ...patch } } : current,
    );
  }

  function openNewLine() {
    const uid = `line-${nextLineId.current}`;
    nextLineId.current += 1;
    setRollingStatus(null);
    setEditor({ line: newWasteLine(uid), isNew: true });
  }

  function openExistingLine(line: WasteLineState) {
    setRollingStatus(null);
    setEditor({ line: cloneWasteLine(line), isNew: false });
  }

  function closeEditor() {
    setEditor(null);
    setRollingStatus(null);
  }

  async function requestLeave() {
    if (isSubmitting) return;
    if (hasDraftChanges) {
      const confirmed = await confirm({
        title: "Bỏ phiếu hao hụt?",
        description: "Các dòng và ghi chú chưa tạo sẽ bị mất.",
        confirmText: "Bỏ phiếu",
        cancelText: "Tiếp tục lập phiếu",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push(stockBasePath);
  }

  function handleLeaveClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isSubmitting && !hasDraftChanges) return;
    event.preventDefault();
    if (!isSubmitting) void requestLeave();
  }

  function handleLocationChange(value: string) {
    const nextLocationId = Number(value);
    setLocationId(nextLocationId);
    setLines((currentLines) =>
      currentLines.map((line) => {
        const ingredient =
          line.ingredientId === null
            ? null
            : ingredientById.get(line.ingredientId);
        if (!ingredient) return line;
        const issueUnit = ingredient.issueUnits.find(
          (unit) => String(unit.unitId) === line.entryUnitId,
        );
        const stock = resolveLocationStock(ingredient, nextLocationId);
        return {
          ...line,
          quantity: clampIssueEntryQuantity(
            line.quantity,
            getIssueMaxEntryQuantity(stock?.quantity ?? 0, issueUnit),
          ),
          unitCost:
            stock?.unitCost === null || stock?.unitCost === undefined
              ? ""
              : String(stock.unitCost),
        };
      }),
    );
  }

  function handleEditorIngredientChange(value: string) {
    const ingredient = ingredientById.get(Number(value));
    if (!ingredient) return;
    const defaultUnit =
      ingredient.issueUnits.find((unit) => unit.isBase) ??
      ingredient.issueUnits[0] ??
      null;
    const stock = resolveLocationStock(ingredient, locationId);
    patchEditor({
      ingredientId: ingredient.id,
      unit: defaultUnit?.label ?? ingredient.unit,
      entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
      quantity: clampIssueEntryQuantity(
        editor?.line.quantity ?? "",
        getIssueMaxEntryQuantity(stock?.quantity ?? 0, defaultUnit),
      ),
      unitCost:
        stock?.unitCost === null || stock?.unitCost === undefined
          ? ""
          : String(stock.unitCost),
    });
  }

  function handleEditorUnitChange(value: string) {
    if (!editorDetails?.selectedIngredient) return;
    const unit = editorDetails.selectedIngredient.issueUnits.find(
      (item) => String(item.unitId) === value,
    );
    patchEditor({
      entryUnitId: value,
      unit: unit?.label ?? editor?.line.unit ?? "",
      quantity: clampIssueEntryQuantity(
        editor?.line.quantity ?? "",
        getIssueMaxEntryQuantity(
          editorDetails.locationStock?.quantity ?? 0,
          unit,
        ),
      ),
    });
  }

  function saveEditor() {
    if (!editor || !editorDetails) return;
    const { line } = editor;
    const {
      selectedIngredient,
      selectedUnit,
      availableQuantity,
      baseQuantity,
    } = editorDetails;

    if (!selectedIngredient) {
      toast.error("Chọn nguyên liệu trước khi lưu dòng.");
      return;
    }
    if (!selectedUnit) {
      toast.error("Chọn đơn vị xuất kho cho dòng này.");
      return;
    }
    if (!line.reasonCode) {
      toast.error("Chọn lý do hao hụt cho dòng này.");
      return;
    }
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
      toast.error("Số lượng phải lớn hơn 0.");
      return;
    }
    if (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) <= 0) {
      toast.error("Chưa có WAC cho nguyên liệu tại vị trí kho này.");
      return;
    }
    if (baseQuantity > availableQuantity + 1e-9) {
      toast.error("Số lượng vượt tồn hiện tại.");
      return;
    }
    if (
      (editorDetails.preview.photoRequired ||
        forcePhotoLineUids.has(line.uid)) &&
      line.photoUrls.length === 0
    ) {
      toast.error(`Dòng "${selectedIngredient.name}" cần ảnh bằng chứng.`);
      return;
    }

    setLines((currentLines) =>
      editor.isNew
        ? [...currentLines, cloneWasteLine(line)]
        : currentLines.map((currentLine) =>
            currentLine.uid === line.uid ? cloneWasteLine(line) : currentLine,
          ),
    );
    setForcePhotoLineUids((current) => {
      if (!current.has(line.uid)) return current;
      const next = new Set(current);
      next.delete(line.uid);
      return next;
    });
    closeEditor();
  }

  function removeEditorLine() {
    if (!editor || editor.isNew) return;
    setLines((currentLines) =>
      currentLines.filter((line) => line.uid !== editor.line.uid),
    );
    setForcePhotoLineUids((current) => {
      if (!current.has(editor.line.uid)) return current;
      const next = new Set(current);
      next.delete(editor.line.uid);
      return next;
    });
    closeEditor();
  }

  async function requestRemoveEditorLine() {
    if (!editor || editor.isNew) return;
    const confirmed = await confirm({
      title: "Xóa dòng hao hụt?",
      description: "Dòng nguyên liệu này sẽ bị bỏ khỏi phiếu nháp.",
      confirmText: ACTIONS_VI.delete,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (confirmed) removeEditorLine();
  }

  function getLinePreview(line: WasteLineState) {
    const ingredient =
      line.ingredientId === null ? null : ingredientById.get(line.ingredientId);
    const selectedUnit = ingredient?.issueUnits.find(
      (unit) => String(unit.unitId) === line.entryUnitId,
    );
    const stock = ingredient
      ? resolveLocationStock(ingredient, locationId)
      : null;
    const baseQuantity = getIssueBaseQuantity(
      Number(line.quantity) || 0,
      selectedUnit,
    );
    const value = getLineValue(line, ingredient);
    const lineIngredientId = line.ingredientId;
    const pendingIngredientValue =
      lineIngredientId === null
        ? value
        : lines.reduce((sum, currentLine) => {
            if (
              currentLine.ingredientId === null ||
              currentLine.ingredientId !== lineIngredientId
            ) {
              return sum;
            }
            return (
              sum +
              getLineValue(currentLine, ingredientById.get(lineIngredientId))
            );
          }, 0);
    return {
      ingredient,
      selectedUnit,
      stock,
      value,
      preview: previewWasteTier({
        value,
        baseQuantity,
        availableQuantity: Number(stock?.quantity ?? 0),
        reasonCode: line.reasonCode,
        projectedShiftSum: context!.capStatus.shiftSum + totalValue,
        projectedBranchSum: context!.capStatus.branchToday + totalValue,
        branchCap: context!.capStatus.branchCap,
        rollingSum: null,
        pendingIngredientValue,
      }),
    };
  }

  function handleSubmit() {
    if (editor) {
      toast.error("Lưu hoặc đóng dòng đang sửa trước khi tạo phiếu.");
      return;
    }
    if (locationId === null) {
      toast.error("Chọn vị trí kho trước khi tạo phiếu.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Thêm ít nhất một nguyên liệu vào phiếu.");
      return;
    }

    for (const line of lines) {
      const details = getLinePreview(line);
      if (!details.ingredient || !details.selectedUnit) {
        toast.error("Dòng hao hụt có nguyên liệu hoặc đơn vị không hợp lệ.");
        openExistingLine(line);
        return;
      }
      if (!line.reasonCode || Number(line.quantity) <= 0) {
        toast.error("Hoàn tất số lượng và lý do cho từng dòng.");
        openExistingLine(line);
        return;
      }
      if (
        !Number.isFinite(Number(line.unitCost)) ||
        Number(line.unitCost) <= 0
      ) {
        toast.error("Chưa có WAC cho nguyên liệu tại vị trí kho này.");
        openExistingLine(line);
        return;
      }
      const baseQuantity = getIssueBaseQuantity(
        Number(line.quantity),
        details.selectedUnit,
      );
      if (baseQuantity > Number(details.stock?.quantity ?? 0) + 1e-9) {
        toast.error("Số lượng vượt tồn hiện tại.");
        openExistingLine(line);
        return;
      }
      if (
        (details.preview.photoRequired || forcePhotoLineUids.has(line.uid)) &&
        line.photoUrls.length === 0
      ) {
        setForcePhotoLineUids((current) => new Set([...current, line.uid]));
        toast.error(`Dòng "${details.ingredient.name}" cần ảnh bằng chứng.`);
        openExistingLine(line);
        return;
      }
    }

    startSubmit(async () => {
      try {
        const result = await createWasteEntry({
          branchId,
          locationId,
          items: lines.map((line) => ({
            ingredient_id: line.ingredientId!,
            quantity: Number(line.quantity),
            entry_unit_id: Number(line.entryUnitId),
            unit_cost: Number(line.unitCost),
            reason_code: line.reasonCode as never,
            note: line.note || undefined,
            photo_urls: line.photoUrls,
          })),
          notes: notes || undefined,
          sourceType: "manual",
        });
        if (!result.success) {
          if (
            result.error?.includes("bằng chứng") ||
            result.error?.includes("ảnh")
          ) {
            setForcePhotoLineUids(new Set(lines.map((line) => line.uid)));
          }
          toast.error(result.error ?? "Không tạo được phiếu hao hụt.");
          return;
        }

        toast.success(
          `Đã tạo phiếu ${result.data?.issueNumber ?? ""} (${result.data?.itemsCreated ?? 0} dòng)${result.data?.requiresApproval ? " · Chờ quản lý duyệt" : ""}`,
        );
        router.push(stockBasePath);
      } catch (error) {
        console.error("branch.waste.create_failed", error);
        toast.error("Không tạo được phiếu hao hụt.");
      }
    });
  }

  const editorPhotoRequired =
    editor !== null &&
    ((editorDetails?.preview.photoRequired ?? false) ||
      forcePhotoLineUids.has(editor.line.uid));

  return (
    <BranchOperatorPage
      title={wasteCopy.title}
      description={branchName}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link
                href={stockBasePath}
                aria-label="Quay lại kho"
                aria-disabled={isSubmitting || undefined}
                className={
                  isSubmitting ? "pointer-events-none opacity-50" : undefined
                }
                onClick={handleLeaveClick}
              />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{wasteCopy.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title="Thông tin phiếu"
              description={branchName}
              icon={IconPackageMinus}
              size="sm"
              contentClassName="gap-3"
            >
              <FormField
                controlId="branch-waste-location"
                label={wasteCopy.location}
                required
              >
                <Select
                  value={locationId === null ? "" : String(locationId)}
                  onValueChange={handleLocationChange}
                  disabled={isSubmitting || editor !== null}
                >
                  <SelectTrigger
                    id="branch-waste-location"
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue placeholder={wasteCopy.chooseLocation} />
                  </SelectTrigger>
                  <SelectContent>
                    {context.locations.map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.name} ({location.kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                controlId="branch-waste-notes"
                label={wasteCopy.generalNotes}
              >
                <Textarea
                  id="branch-waste-notes"
                  name="branch-waste-notes"
                  autoComplete="off"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={isSubmitting || editor !== null}
                  rows={2}
                />
              </FormField>
            </BranchOperatorPanel>

            <BranchOperatorPanel
              title="Kiểm soát hao hụt"
              size="sm"
              contentClassName="gap-2"
            >
              <BranchDailyCapBanner
                branchToday={context.capStatus.branchToday}
                branchCap={context.capStatus.branchCap}
                pendingDelta={totalValue}
              />
              <ShiftCapMeter
                shiftSum={context.capStatus.shiftSum}
                shiftCap={context.capStatus.shiftCap}
                pendingDelta={totalValue}
                shiftLabel={context.capStatus.shiftKey}
              />
            </BranchOperatorPanel>
          </div>

          <BranchOperatorPanel
            title="Dòng hao hụt"
            description="Chọn nguyên liệu và hoàn tất từng dòng trước khi tạo phiếu."
            size="sm"
            contentClassName="gap-3"
            action={
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={openNewLine}
                disabled={isSubmitting || editor !== null}
              >
                <IconCirclePlus data-icon="inline-start" />
                {wasteCopy.addLine}
              </Button>
            }
          >
            {lines.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconPackageMinus />}
                title="Chưa có dòng hao hụt"
                description="Thêm nguyên liệu để bắt đầu lập phiếu."
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {lines.map((line) => {
                  const details = getLinePreview(line);
                  const quantity = Number(line.quantity) || 0;
                  const photoRequired =
                    details.preview.photoRequired ||
                    forcePhotoLineUids.has(line.uid);
                  return (
                    <div key={line.uid} role="listitem">
                      <Item
                        variant="outline"
                        className="min-h-20 touch-manipulation"
                        render={
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => openExistingLine(line)}
                            disabled={isSubmitting || editor !== null}
                          />
                        }
                      >
                        <ItemContent className="min-w-0 gap-1">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {details.ingredient?.name ?? "Nguyên liệu"}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs">
                            {formatQty(quantity)}{" "}
                            {details.selectedUnit?.label ?? line.unit}
                            {details.stock
                              ? ` · Tồn: ${formatQty(details.stock.quantity)} ${details.ingredient?.unit ?? line.unit}`
                              : ""}
                          </ItemDescription>
                          <ItemDescription className="line-clamp-none text-xs font-semibold text-foreground">
                            {formatVND(details.value)}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0">
                          <WasteTierBadge
                            tier={
                              photoRequired && details.preview.tier === 0
                                ? 1
                                : details.preview.tier
                            }
                            photoRequired={photoRequired}
                            approvalRequired={details.preview.approvalRequired}
                            compact
                          />
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        </ItemActions>
                      </Item>
                    </div>
                  );
                })}
              </ItemGroup>
            )}
            <p className="text-right font-mono text-sm font-semibold tabular-nums">
              {wasteCopy.total(formatVND(totalValue))}
            </p>
          </BranchOperatorPanel>
        </div>

        <AppDetailFooter
          sticky
          leading={
            <Button
              variant="outline"
              size="touch"
              render={
                <Link
                  href={stockBasePath}
                  aria-disabled={isSubmitting || undefined}
                  className={
                    isSubmitting ? "pointer-events-none opacity-50" : undefined
                  }
                  onClick={handleLeaveClick}
                />
              }
            >
              {ACTIONS_VI.cancel}
            </Button>
          }
          trailing={
            <Button
              type="button"
              size="touch-lg"
              onClick={handleSubmit}
              disabled={isSubmitting || lines.length === 0 || editor !== null}
            >
              {isSubmitting ? (
                <Spinner className="size-5" />
              ) : (
                wasteCopy.createSlip
              )}
            </Button>
          }
        />

        <Sheet
          open={editor !== null}
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
        >
          <SheetContent
            side="bottom"
            className="max-h-dvh-95 bg-background p-0 text-foreground"
            showCloseButton={false}
          >
            {editor && editorDetails ? (
              <>
                <SheetHeader>
                  <SectionLabel density="dense">
                    {editor.isNew ? "Thêm dòng hao hụt" : "Sửa dòng hao hụt"}
                  </SectionLabel>
                  <SheetTitle className="text-lg font-semibold">
                    {editorDetails.selectedIngredient?.name ??
                      "Chọn nguyên liệu"}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {editorDetails.selectedUnit?.label ?? "Chưa chọn đơn vị"}
                  </p>
                </SheetHeader>

                <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
                  <div className="flex min-w-0 flex-col gap-3">
                    <FormField
                      controlId="branch-waste-ingredient"
                      label={PRODUCT_VI.rawIngredient}
                      required
                    >
                      <Combobox
                        id="branch-waste-ingredient"
                        options={ingredientOptions}
                        value={
                          editor.line.ingredientId === null
                            ? ""
                            : String(editor.line.ingredientId)
                        }
                        onValueChange={handleEditorIngredientChange}
                        placeholder={wasteCopy.chooseIngredient}
                        size="touch"
                        disabled={isSubmitting}
                      />
                    </FormField>

                    {editorDetails.selectedIngredient ? (
                      <>
                        <FormField
                          controlId="branch-waste-unit"
                          label={FORM_VI.unit}
                          required
                        >
                          <Select
                            value={editor.line.entryUnitId}
                            onValueChange={handleEditorUnitChange}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger
                              id="branch-waste-unit"
                              size="touch"
                              className="w-full"
                            >
                              <SelectValue
                                placeholder={
                                  messages.inventory.transfer.selectUnit
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {editorDetails.selectedIngredient.issueUnits.map(
                                (unit) => (
                                  <SelectItem
                                    key={unit.unitId}
                                    value={String(unit.unitId)}
                                  >
                                    {unit.label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </FormField>

                        <FormField
                          controlId="branch-waste-quantity"
                          label={FORM_VI.quantity}
                          required
                          description={
                            editorDetails.locationStock
                              ? `Tồn vị trí: ${formatQty(editorDetails.locationStock.quantity)} ${editorDetails.selectedIngredient.unit}`
                              : "Chưa có tồn tại vị trí kho đã chọn"
                          }
                        >
                          <InputGroup className="h-12">
                            <FormattedNumberInput
                              id="branch-waste-quantity"
                              name="branch-waste-quantity"
                              maxFractionDigits={3}
                              inputMode="decimal"
                              value={editor.line.quantity}
                              onValueChange={(value) =>
                                patchEditor({
                                  quantity: clampIssueEntryQuantity(
                                    value,
                                    editorDetails.maxEntryQuantity,
                                  ),
                                })
                              }
                              disabled={isSubmitting}
                              placeholder="0"
                              className="h-full flex-1 rounded-none border-0 bg-transparent text-base shadow-none focus-visible:ring-1 dark:bg-transparent"
                            />
                            {formatIssueMaxEntryQuantity(
                              editorDetails.maxEntryQuantity,
                            ) ? (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() =>
                                    patchEditor({
                                      quantity: formatIssueMaxEntryQuantity(
                                        editorDetails.maxEntryQuantity,
                                      ),
                                    })
                                  }
                                >
                                  {FORM_VI.max}
                                </InputGroupButton>
                              </InputGroupAddon>
                            ) : null}
                          </InputGroup>
                        </FormField>

                        <Item variant="outline" size="sm">
                          <ItemContent className="min-w-0 gap-1">
                            <ItemTitle className="text-sm font-medium">
                              {wasteCopy.unitCostLabel(
                                editorDetails.selectedIngredient.unit,
                              )}
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none text-xs">
                              {editorDetails.locationStock
                                ? `Giá trị dự kiến: ${formatVND(editorDetails.value)}`
                                : "Chưa có WAC tại vị trí kho này"}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions className="font-mono text-sm font-semibold tabular-nums">
                            {Number(editor.line.unitCost) > 0
                              ? formatVND(Number(editor.line.unitCost))
                              : "Chưa có WAC"}
                          </ItemActions>
                        </Item>

                        <FormField
                          controlId="branch-waste-reason"
                          label={FORM_VI.reason}
                          required
                        >
                          <WasteReasonDropdown
                            id="branch-waste-reason"
                            value={editor.line.reasonCode as never}
                            onChange={(value) =>
                              patchEditor({ reasonCode: value })
                            }
                            disabled={isSubmitting}
                            size="touch"
                            className="w-full"
                          />
                        </FormField>

                        <AntiSplitRollingMeter
                          branchId={branchId}
                          ingredientId={editor.line.ingredientId}
                          pendingDelta={editorDetails.value}
                          ingredientName={editorDetails.selectedIngredient.name}
                          onStatusChange={(status) =>
                            setRollingStatus(
                              status as WasteRollingStatus | null,
                            )
                          }
                        />

                        <WasteTierBadge
                          tier={
                            editorPhotoRequired &&
                            editorDetails.preview.tier === 0
                              ? 1
                              : editorDetails.preview.tier
                          }
                          photoRequired={editorPhotoRequired}
                          approvalRequired={
                            editorDetails.preview.approvalRequired
                          }
                        />

                        {editorPhotoRequired ||
                        editor.line.photoUrls.length > 0 ? (
                          <FormField
                            controlId="branch-waste-photo"
                            label={wasteCopy.proofPhotoLabel(
                              editorDetails.preview.tier === 0
                                ? 1
                                : editorDetails.preview.tier,
                            )}
                            required={editorPhotoRequired}
                          >
                            <WastePhotoUpload
                              id="branch-waste-photo"
                              tenantId={context.tenantId}
                              issueId={`branch-draft-${editor.line.uid}`}
                              value={editor.line.photoUrls[0] ?? null}
                              onChange={(url) =>
                                patchEditor({ photoUrls: url ? [url] : [] })
                              }
                              disabled={isSubmitting}
                            />
                          </FormField>
                        ) : null}

                        <FormField
                          controlId="branch-waste-line-note"
                          label={wasteCopy.lineNotes}
                        >
                          <Textarea
                            id="branch-waste-line-note"
                            name="branch-waste-line-note"
                            autoComplete="off"
                            value={editor.line.note}
                            onChange={(event) =>
                              patchEditor({ note: event.target.value })
                            }
                            disabled={isSubmitting}
                            rows={3}
                          />
                        </FormField>
                      </>
                    ) : null}
                  </div>
                </div>

                <SheetFooter>
                  <Button
                    type="button"
                    size="touch-lg"
                    className="w-full"
                    onClick={saveEditor}
                    disabled={isSubmitting || !editorDetails.selectedIngredient}
                  >
                    {editor.isNew ? "Thêm vào phiếu" : "Lưu dòng"}
                  </Button>
                  <div className="flex gap-2">
                    {!editor.isNew ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="touch-lg"
                        className="flex-1"
                        onClick={() => void requestRemoveEditorLine()}
                        disabled={isSubmitting}
                      >
                        <IconTrash data-icon="inline-start" />
                        {ACTIONS_VI.delete}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="touch-lg"
                      className="flex-1"
                      onClick={closeEditor}
                      disabled={isSubmitting}
                    >
                      {ACTIONS_VI.close}
                    </Button>
                  </div>
                </SheetFooter>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    </BranchOperatorPage>
  );
}

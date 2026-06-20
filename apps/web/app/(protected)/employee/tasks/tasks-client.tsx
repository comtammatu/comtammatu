"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: employee consumption report form keeps operational copy close to the workflow controls */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleSlash as IconNoConsumption,
  Plus as IconPlus,
  Send as IconSend,
  Trash2 as IconTrash,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
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
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { messages } from "@lib/messages";
import { EmployeeFrame } from "../components/employee-page";
import type {
  ConsumptionIngredientOption,
  ConsumptionReportStatus,
  ConsumptionReportView,
} from "../consumption-actions";
import { submitConsumptionReport } from "../consumption-actions";
import type { TodayChecklistItem } from "../_lib/today-work-state";
import { toggleChecklistItem } from "../clock/actions";

const taskCopy = messages.employee.tasks;
const CHECKLIST_PHASES = [
  "start_of_shift",
  "during_shift",
  "end_of_shift",
] as const;

interface TasksClientProps {
  items: TodayChecklistItem[];
  disabled?: boolean;
  attendanceId?: number | null;
  consumptionIngredients?: ConsumptionIngredientOption[];
  consumptionReport?: ConsumptionReportView | null;
  showConsumptionReport?: boolean;
}

interface DraftConsumptionLine {
  key: string;
  ingredientId: string;
  defaultItemId: number | null;
  quantity: string;
  note: string;
}

const consumptionStatusLabel: Record<ConsumptionReportStatus, string> = {
  draft: "Nháp",
  submitted: "Chờ duyệt",
  needs_changes: "Cần chỉnh sửa",
  approved: "Đã duyệt - không phát sinh",
  applied: "Đã áp Inventory",
  cancelled: "Đã hủy",
};

function statusVariant(
  status: ConsumptionReportStatus,
): "secondary" | "warning" | "destructive" | "success" {
  if (status === "submitted") return "warning";
  if (status === "needs_changes") return "destructive";
  if (status === "approved" || status === "applied") return "success";
  return "secondary";
}

function emptyLine(): DraftConsumptionLine {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    ingredientId: "",
    defaultItemId: null,
    quantity: "",
    note: "",
  };
}

function defaultIngredientsToDraft(
  ingredients: ConsumptionIngredientOption[],
): DraftConsumptionLine[] {
  const defaults = ingredients
    .filter((ingredient) => ingredient.isDefault)
    .sort((a, b) => {
      const left = a.defaultSortOrder ?? Number.MAX_SAFE_INTEGER;
      const right = b.defaultSortOrder ?? Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return a.name.localeCompare(b.name, "vi");
    });
  if (defaults.length === 0) return [emptyLine()];

  return defaults.map((ingredient) => ({
    key: `default-${ingredient.defaultItemId ?? ingredient.id}`,
    ingredientId: String(ingredient.id),
    defaultItemId: ingredient.defaultItemId,
    quantity: "",
    note: ingredient.defaultNote ?? "",
  }));
}

function reportLinesToDraft(
  report: ConsumptionReportView | null | undefined,
  ingredients: ConsumptionIngredientOption[],
): DraftConsumptionLine[] {
  if (!report) return defaultIngredientsToDraft(ingredients);
  if (report.noConsumption) return [];
  if (!report.lines.length) return defaultIngredientsToDraft(ingredients);

  return report.lines.map((line) => ({
    key: String(line.id),
    ingredientId: String(line.ingredientId),
    defaultItemId: line.defaultItemId,
    quantity: String(line.quantity),
    note: line.note ?? "",
  }));
}

function sortPhaseItems(items: TodayChecklistItem[]) {
  return [...items].sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1;
    if (left.isRequired !== right.isRequired) return left.isRequired ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function TasksClient({
  items,
  disabled = false,
  attendanceId = null,
  consumptionIngredients = [],
  consumptionReport = null,
  showConsumptionReport = false,
}: TasksClientProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  function handleToggle(itemId: number, done: boolean) {
    const previous = localItems;
    if (disabled) return;

    setLocalItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, done } : item)),
    );

    startTransition(async () => {
      const result = await toggleChecklistItem({ itemId, done });
      if (!result.success) {
        setLocalItems(previous);
        toast.error(result.error ?? taskCopy.updateError);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = localItems.filter((item) => item.phase === phase);
        if (phaseItems.length === 0) return null;
        const sortedPhaseItems = sortPhaseItems(phaseItems);
        const phaseDone = phaseItems.filter((item) => item.done).length;
        const phaseRequiredRemaining = phaseItems.filter(
          (item) => item.isRequired && !item.done,
        ).length;
        const headingId = `shift-task-phase-${phase}`;

        return (
          <section
            key={phase}
            className="flex flex-col gap-3"
            aria-labelledby={headingId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={headingId} className="text-sm font-medium">
                {taskCopy.phaseLabels[phase]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={
                    phaseDone === phaseItems.length ? "success" : "secondary"
                  }
                >
                  {phaseDone}/{phaseItems.length} {taskCopy.done}
                </Badge>
                {phaseRequiredRemaining > 0 ? (
                  <Badge variant="warning">
                    {phaseRequiredRemaining} {taskCopy.requiredRemaining}
                  </Badge>
                ) : null}
              </div>
            </div>
            <ItemGroup className="gap-2">
              {sortedPhaseItems.map((item) => {
                const checkboxId = `shift-task-${item.id}`;
                return (
                  <Item
                    key={item.id}
                    variant="outline"
                    className={cn(
                      "min-h-16 items-center bg-card transition-[transform,background-color,border-color,box-shadow] duration-150 active:translate-y-px motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:hover:-translate-y-px sm:flex-nowrap",
                      item.done
                        ? "border-success/30 bg-success/5"
                        : "hover:bg-muted/50",
                      disabled && "bg-muted/40",
                    )}
                  >
                    <ItemContent>
                      <ItemTitle
                        className={cn(
                          "w-full text-sm leading-5",
                          item.done && "text-muted-foreground",
                        )}
                      >
                        <label
                          className="w-full cursor-pointer"
                          htmlFor={checkboxId}
                        >
                          {item.title}
                        </label>
                      </ItemTitle>
                      {item.doneDefinition ? (
                        <ItemDescription className="line-clamp-none text-xs leading-5">
                          {item.doneDefinition}
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                    <ItemActions className="ml-auto shrink-0">
                      {item.isRequired ? (
                        <Badge variant="outline">{taskCopy.required}</Badge>
                      ) : null}
                      <Badge variant={item.done ? "success" : "secondary"}>
                        {item.done ? taskCopy.done : taskCopy.todo}
                      </Badge>
                      <Checkbox
                        id={checkboxId}
                        checked={item.done}
                        disabled={disabled || isPending}
                        onCheckedChange={(checked) => {
                          handleToggle(item.id, checked === true);
                        }}
                        aria-label={
                          item.done ? taskCopy.markTodo : taskCopy.markDone
                        }
                      />
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </section>
        );
      })}

      {showConsumptionReport && attendanceId ? (
        <ConsumptionReportPanel
          attendanceId={attendanceId}
          disabled={disabled}
          ingredients={consumptionIngredients}
          report={consumptionReport}
        />
      ) : null}
    </div>
  );
}

function ConsumptionReportPanel({
  attendanceId,
  disabled,
  ingredients,
  report,
}: {
  attendanceId: number;
  disabled: boolean;
  ingredients: ConsumptionIngredientOption[];
  report: ConsumptionReportView | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(() =>
    reportLinesToDraft(report, ingredients),
  );
  const [note, setNote] = useState(report?.note ?? "");
  const [noConsumption, setNoConsumption] = useState(
    report?.noConsumption ?? false,
  );
  const [isPending, startTransition] = useTransition();
  const status = report?.status ?? "draft";
  const locked =
    disabled ||
    status === "submitted" ||
    status === "approved" ||
    status === "applied" ||
    status === "cancelled";

  useEffect(() => {
    setLines(reportLinesToDraft(report, ingredients));
    setNote(report?.note ?? "");
    setNoConsumption(report?.noConsumption ?? false);
  }, [ingredients, report]);

  function updateLine(index: number, patch: Partial<DraftConsumptionLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(index: number) {
    setLines((current) => {
      const next = current.filter((_, lineIndex) => lineIndex !== index);
      return next.length > 0 ? next : [emptyLine()];
    });
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function submit() {
    const parsedLines = lines
      .map((line) => ({
        ingredientId: Number(line.ingredientId),
        defaultItemId: line.defaultItemId,
        quantity: Number(line.quantity),
        note: line.note.trim() || null,
      }))
      .filter(
        (line) =>
          Number.isFinite(line.ingredientId) &&
          line.ingredientId > 0 &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0,
      );

    if (parsedLines.length === 0) {
      toast.error("Nhập ít nhất một dòng tiêu hao.");
      return;
    }

    const uniqueIngredientCount = new Set(
      parsedLines.map((line) => line.ingredientId),
    ).size;
    if (uniqueIngredientCount !== parsedLines.length) {
      toast.error("Mỗi nguyên liệu chỉ nhập một dòng.");
      return;
    }

    startTransition(async () => {
      const result = await submitConsumptionReport({
        attendanceId,
        note,
        noConsumption: false,
        lines: parsedLines,
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể gửi báo cáo tiêu hao.");
        return;
      }

      toast.success("Đã gửi báo cáo tiêu hao, chờ Trưởng chi nhánh duyệt.");
      router.refresh();
    });
  }

  function submitNoConsumption() {
    startTransition(async () => {
      const result = await submitConsumptionReport({
        attendanceId,
        note,
        noConsumption: true,
        lines: [],
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể gửi báo cáo tiêu hao.");
        return;
      }

      toast.success("Đã gửi xác nhận không phát sinh tiêu hao.");
      setNoConsumption(true);
      router.refresh();
    });
  }

  return (
    <EmployeeFrame
      pad="sm"
      className="flex flex-col gap-3 border-border/70 bg-muted/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Báo cáo tiêu hao bếp</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Inventory chỉ ghi nhận sau khi Trưởng chi nhánh duyệt.
          </p>
        </div>
        <Badge variant={statusVariant(status)}>
          {consumptionStatusLabel[status]}
        </Badge>
      </div>

      {status === "needs_changes" && report?.reviewNote ? (
        <EmployeeFrame
          pad="sm"
          className="border-warning/30 bg-warning/10 text-sm leading-5"
        >
          <span className="font-medium">Yêu cầu chỉnh sửa: </span>
          {report.reviewNote}
        </EmployeeFrame>
      ) : null}

      {noConsumption ? (
        <EmployeeFrame
          pad="sm"
          className="flex flex-col gap-2 bg-background text-sm text-muted-foreground"
        >
          <span>Không phát sinh tiêu hao trong ca này.</span>
          {!locked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={isPending}
              onClick={() => {
                setNoConsumption(false);
                setLines(defaultIngredientsToDraft(ingredients));
              }}
            >
              Nhập tiêu hao
            </Button>
          ) : null}
        </EmployeeFrame>
      ) : null}

      {!noConsumption ? (
        <div className="flex flex-col gap-2">
          {lines.map((line, index) => {
            const selected = ingredients.find(
              (item) => String(item.id) === line.ingredientId,
            );

            return (
              <EmployeeFrame
                key={line.key}
                pad="sm"
                className="grid gap-2 bg-background md:grid-cols-[minmax(0,1.5fr)_110px_minmax(0,1fr)_auto]"
              >
                <div className="flex flex-col gap-1.5">
                  <Label>Nguyên liệu</Label>
                  {locked ? (
                    <p className="min-h-9 rounded-md bg-muted/30 px-3 py-2 text-sm ring-1 ring-border">
                      {selected?.name ??
                        report?.lines[index]?.ingredientName ??
                        "Nguyên liệu"}
                    </p>
                  ) : (
                    <Select
                      value={line.ingredientId}
                      onValueChange={(value) =>
                        updateLine(index, {
                          ingredientId: value,
                          defaultItemId:
                            ingredients.find(
                              (item) => String(item.id) === value,
                            )?.defaultItemId ?? null,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn nguyên liệu" />
                      </SelectTrigger>
                      <SelectContent>
                        {ingredients.map((ingredient) => (
                          <SelectItem
                            key={ingredient.id}
                            value={String(ingredient.id)}
                          >
                            {ingredient.name} · {ingredient.unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Số lượng</Label>
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    disabled={locked}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    placeholder={selected?.unit ?? "SL"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Ghi chú</Label>
                  <Input
                    value={line.note}
                    disabled={locked}
                    onChange={(event) =>
                      updateLine(index, { note: event.target.value })
                    }
                    placeholder="Hao hụt, ca, lý do"
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end"
                  disabled={locked || lines.length <= 1}
                  onClick={() => removeLine(index)}
                  aria-label="Xóa dòng tiêu hao"
                >
                  <IconTrash className="size-4" />
                </Button>
              </EmployeeFrame>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label>Ghi chú chung</Label>
        <Textarea
          value={note}
          disabled={locked}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ví dụ: tiêu hao ca chiều, đã đối chiếu cuối ca"
        />
      </div>

      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || ingredients.length === 0}
            onClick={addLine}
          >
            <IconPlus data-icon="inline-start" />
            Thêm dòng
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={submitNoConsumption}
          >
            <IconNoConsumption data-icon="inline-start" />
            Không phát sinh
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || ingredients.length === 0 || noConsumption}
            onClick={submit}
          >
            <IconSend data-icon="inline-start" />
            Gửi báo cáo tiêu hao
          </Button>
        </div>
      ) : null}
    </EmployeeFrame>
  );
}

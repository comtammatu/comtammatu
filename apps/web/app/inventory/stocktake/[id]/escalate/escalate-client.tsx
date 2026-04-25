"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { TriangleAlert as IconAlertTriangle, Check as IconCheck, ShieldCheck as IconShieldCheck } from "lucide-react";
import { InventoryHeader } from "../../../_components/inventory-header";
import { InventoryPageContent } from "../../../_components/inventory-page-layout";
import { AbcClassChip } from "../../../_components/abc-class-chip";
import { FormattedNumberInput } from "../../../_components/formatted-number-input";
import {
  escalateRound4,
  finalizeStocktake,
  type StocktakeLineBlind,
} from "../../../stocktake-actions";

interface Props {
  sessionId: number;
  branchId: number;
  status: string;
  currentRound: 1 | 2 | 3 | 4;
  lines: StocktakeLineBlind[];
}

type EscalationState = {
  finalQty: string;
  note: string;
};

interface IngredientSummary {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  abcClass: "A" | "B" | "C" | null;
  rounds: Array<{ roundNo: number; qty: number | null; by: string | null }>;
  isFinal: boolean;
  r4FinalQty: number | null;
}

const MIN_NOTE_LENGTH = 20;

/**
 * Round-4 escalation page (S13b).
 *
 * Shown when `close_recount_round` returned `round_4_escalation_required`
 * or when QLV navigates directly with `current_round = 4`. Per ingredient
 * still `needs_recount`, QLV enters a final qty + note (≥20 chars) and
 * calls `escalate_round_4` which writes a round-4 line AND propagates to
 * round-1 `counted_quantity` / `is_final=true`.
 *
 * After all escalations resolved, "Finalize session" calls
 * `finalize_stocktake` which moves status to `completed`.
 */
export function EscalateClient({
  sessionId,
  branchId,
  status,
  currentRound,
  lines,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forms, setForms] = useState<Record<number, EscalationState>>({});

  // Collapse per-ingredient history + pick candidates that need escalation.
  const summaries: IngredientSummary[] = useMemo(() => {
    const map = new Map<number, IngredientSummary>();
    for (const l of lines) {
      const existing = map.get(l.ingredientId);
      const round = { roundNo: l.roundNo, qty: l.countedQuantity, by: l.countedBy };
      if (existing) {
        existing.rounds.push(round);
        existing.isFinal = existing.isFinal && l.isFinal;
        if (l.roundNo === 4 && l.isFinal) {
          existing.r4FinalQty = l.countedQuantity;
        }
      } else {
        map.set(l.ingredientId, {
          ingredientId: l.ingredientId,
          ingredientName: l.ingredientName,
          unit: l.unit,
          abcClass: l.abcClass,
          rounds: [round],
          isFinal: l.isFinal,
          r4FinalQty: l.roundNo === 4 && l.isFinal ? l.countedQuantity : null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.ingredientName.localeCompare(b.ingredientName, "vi"),
    );
  }, [lines]);

  const needEscalation = summaries.filter((s) => !s.isFinal);
  const resolved = summaries.filter((s) => s.r4FinalQty !== null);
  const editable = status === "in_progress" && currentRound >= 3;

  function updateForm(id: number, patch: Partial<EscalationState>) {
    setForms((prev) => ({
      ...prev,
      [id]: { finalQty: "", note: "", ...prev[id], ...patch },
    }));
  }

  function doEscalate(row: IngredientSummary) {
    const f = forms[row.ingredientId] ?? { finalQty: "", note: "" };
    const qty = Number(f.finalQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Số lượng final không hợp lệ");
      return;
    }
    if (f.note.trim().length < MIN_NOTE_LENGTH) {
      toast.error(`Ghi chú phải có ít nhất ${MIN_NOTE_LENGTH} ký tự`);
      return;
    }

    startTransition(async () => {
      const res = await escalateRound4({
        sessionId,
        ingredientId: row.ingredientId,
        finalQty: qty,
        note: f.note.trim(),
      });
      if (!res.success) {
        toast.error(res.error ?? "Không escalate được");
        return;
      }
      toast.success(`Đã escalate ${row.ingredientName} = ${qty} ${row.unit}`);
      router.refresh();
    });
  }

  function doFinalize() {
    if (needEscalation.length > 0) {
      toast.error("Còn dòng chưa escalate — không thể finalize");
      return;
    }
    startTransition(async () => {
      const res = await finalizeStocktake(sessionId);
      if (!res.success) {
        toast.error(res.error ?? "Không finalize được");
        return;
      }
      toast.success("Đã finalize session — trạng thái completed");
      router.push(`/inventory/stocktake/${sessionId}`);
    });
  }

  return (
    <>
      <InventoryHeader
        title={`Round-4 escalation — Session #${sessionId}`}
        description={`CN #${branchId} · ${needEscalation.length} dòng chờ xử lý · ${resolved.length} đã escalate`}
      />
      <InventoryPageContent>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <IconShieldCheck className="size-5 text-red-600" />
                  Escalation QLV + Admin
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mỗi dòng chưa đóng cần final qty + ghi chú ≥ {MIN_NOTE_LENGTH} ký tự.
                  Action áp dụng ngay vào round-1 và khoá dòng.
                </p>
              </div>
              <Button
                type="button"
                variant="default"
                onClick={doFinalize}
                disabled={pending || needEscalation.length > 0 || !editable}
              >
                <IconCheck className="size-4" />
                {needEscalation.length > 0
                  ? `Còn ${needEscalation.length} dòng`
                  : "Finalize session"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editable ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <IconAlertTriangle className="mr-2 inline size-4 -translate-y-[1px]" />
                Session không ở trạng thái escalation. Status = {status} · Round = R{currentRound}.
              </div>
            ) : null}

            {needEscalation.length === 0 ? (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                <IconCheck className="mr-2 inline size-4 -translate-y-[1px]" />
                Tất cả dòng đã được xử lý. Bấm &quot;Finalize session&quot; để đóng kỳ.
              </div>
            ) : (
              <div className="space-y-3">
                {needEscalation.map((row) => (
                  <EscalationRow
                    key={row.ingredientId}
                    row={row}
                    form={forms[row.ingredientId] ?? { finalQty: "", note: "" }}
                    onChange={(patch) => updateForm(row.ingredientId, patch)}
                    onSubmit={() => doEscalate(row)}
                    pending={pending}
                    editable={editable}
                  />
                ))}
              </div>
            )}

            {resolved.length > 0 ? (
              <div className="pt-4">
                <h3 className="mb-2 text-sm font-medium">Đã escalate</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {resolved.map((row) => (
                    <div
                      key={row.ingredientId}
                      className="flex items-center justify-between rounded-md border border-green-200 bg-green-50/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{row.ingredientName}</div>
                        <div className="text-xs text-muted-foreground">
                          Final: {row.r4FinalQty} {row.unit}
                        </div>
                      </div>
                      <Badge variant="outline" className="border-green-300 text-green-900">
                        <IconCheck className="size-3.5" /> R4
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </InventoryPageContent>
    </>
  );
}

interface EscalationRowProps {
  row: IngredientSummary;
  form: EscalationState;
  onChange: (patch: Partial<EscalationState>) => void;
  onSubmit: () => void;
  pending: boolean;
  editable: boolean;
}

function EscalationRow({
  row,
  form,
  onChange,
  onSubmit,
  pending,
  editable,
}: EscalationRowProps) {
  const noteLen = form.note.trim().length;
  const canSubmit =
    editable &&
    form.finalQty !== "" &&
    noteLen >= MIN_NOTE_LENGTH &&
    !pending;

  return (
    <div
      data-slot="escalation-row"
      data-ingredient-id={row.ingredientId}
      className="rounded-md border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.ingredientName}</span>
            <AbcClassChip class_={row.abcClass} compact withTooltip />
            <span className="text-xs text-muted-foreground">{row.unit}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {row.rounds
              .sort((a, b) => a.roundNo - b.roundNo)
              .map((r) => (
                <Badge key={r.roundNo} variant="outline" className="gap-1">
                  R{r.roundNo}: {r.qty === null ? "—" : r.qty}
                </Badge>
              ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs">Final qty ({row.unit})</Label>
          <FormattedNumberInput
            value={form.finalQty}
            onValueChange={(v) => onChange({ finalQty: v })}
            maxFractionDigits={3}
            disabled={!editable || pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Ghi chú escalation{" "}
            <span
              className={cn(
                "tabular-nums",
                noteLen >= MIN_NOTE_LENGTH ? "text-green-700" : "text-muted-foreground",
              )}
            >
              ({noteLen}/{MIN_NOTE_LENGTH})
            </span>
          </Label>
          <Textarea
            value={form.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="VD: R2/R3 lệch 12% do hỏng hàng ngày X, QLV+Admin xác nhận final = …"
            rows={2}
            disabled={!editable || pending}
          />
        </div>
        <div className="self-end">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            Escalate
          </Button>
        </div>
      </div>
    </div>
  );
}

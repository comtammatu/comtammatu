"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  AUTO_APPROVE_CONDITION_LABELS_VI,
  AUTO_APPROVE_FAIL_REASON_VI,
} from "@comtammatu/shared/labels";
import { IconCheck, IconX } from "@tabler/icons-react";
import type { AutoApproveEvaluation } from "../variance-actions";

interface AutoApproveEvalPanelProps {
  evaluation: AutoApproveEvaluation;
  className?: string;
}

/**
 * 8-condition breakdown panel (S10/S14).
 * Shows each condition with ✓/✗ icon + Vietnamese label.
 * Summary banner at top: "Sẽ auto-approve" / "Chưa đủ điều kiện".
 */
export function AutoApproveEvalPanel({
  evaluation,
  className,
}: AutoApproveEvalPanelProps) {
  const c = evaluation.conditions;
  const rows: Array<{ key: keyof typeof c; ok: boolean }> = [
    { key: "c1_has_po", ok: c.c1_has_po },
    { key: "c2_variance_ok", ok: c.c2_variance_ok },
    { key: "c3_line_totals_diff", ok: c.c3_line_totals_diff },
    { key: "c4_no_quality_issue", ok: c.c4_no_quality_issue },
    { key: "c5_value_cap", ok: c.c5_value_cap },
    { key: "c6_supplier_history", ok: c.c6_supplier_history },
    { key: "c7_no_manual_review", ok: c.c7_no_manual_review },
    { key: "c8_trust_score_ok", ok: c.c8_trust_score_ok },
  ];

  const softKeys: Array<keyof typeof c> = [
    "c2_variance_ok",
    "c6_supplier_history",
  ];

  return (
    <Card className={cn("", className)} data-slot="auto-approve-panel">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">
            {evaluation.approved
              ? "Sẽ auto-approve khi submit"
              : "Chưa đủ điều kiện auto-approve"}
          </h4>
          <div className="flex gap-2">
            {evaluation.inWindow ? (
              <Badge
                variant="outline"
                className="bg-blue-100 text-blue-900 border-blue-300"
              >
                Trong Express window
                {evaluation.inExtendedWindow ? " (extended)" : ""}
              </Badge>
            ) : null}
            {typeof evaluation.trustScore === "number" ? (
              <Badge variant="secondary">
                Trust: {evaluation.trustScore.toFixed(0)}
              </Badge>
            ) : null}
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-1 text-xs md:grid-cols-2">
          {rows.map(({ key, ok }) => {
            const isSoft = softKeys.includes(key);
            return (
              <li
                key={key}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1",
                  ok ? "text-foreground" : "text-destructive",
                )}
                data-condition={key}
                data-ok={ok}
              >
                {ok ? (
                  <IconCheck className="size-4 text-green-600" />
                ) : (
                  <IconX className="size-4 text-red-600" />
                )}
                <span className="flex-1">
                  {AUTO_APPROVE_CONDITION_LABELS_VI[key]}
                </span>
                {isSoft ? (
                  <Badge variant="outline" className="text-xs">
                    soft
                  </Badge>
                ) : null}
              </li>
            );
          })}
        </ul>

        {evaluation.failedReasons.length > 0 ? (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-medium">Lý do chưa pass: </span>
            {evaluation.failedReasons
              .map((r) => mapReason(r))
              .join(", ")}
          </div>
        ) : null}

        {evaluation.totalGrnValue !== null &&
        evaluation.totalPoValue !== null ? (
          <div className="text-xs text-muted-foreground">
            GRN: {Math.round(evaluation.totalGrnValue).toLocaleString("vi-VN")}₫ •
            PO: {Math.round(evaluation.totalPoValue).toLocaleString("vi-VN")}₫ •
            NCC 90d: {evaluation.supplierGrnCount90d} GRN
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function mapReason(key: string): string {
  return (
    (AUTO_APPROVE_FAIL_REASON_VI as Record<string, string>)[key] ?? key
  );
}

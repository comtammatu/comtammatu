"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Switch } from "@comtammatu/ui/components/switch";
import { Label } from "@comtammatu/ui/components/label";
import { Badge } from "@comtammatu/ui/components/badge";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Snowflake as IconSnowflake } from "lucide-react";
import {
  setCategoryReviewPolicy,
  type CategoryReviewPolicyRow,
} from "@/inventory/catalog-policy-actions";

interface Props {
  initial: CategoryReviewPolicyRow[];
}

/**
 * Cold-chain category admin (S10 §B3).
 *
 * Lists all distinct ingredient categories; toggle per category
 * sets `ingredient_category_review_policy.requires_manual_review`.
 *
 * When enabled, any GRN line with an ingredient in that category
 * fails auto-approve condition c7 — forcing manual review.
 *
 * Item-level overrides (ingredients.review_override) managed elsewhere.
 */
export function ColdChainClient({ initial }: Props) {
  const [rows, setRows] = useState(initial);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startSave] = useTransition();

  function handleToggle(category: string, next: boolean) {
    setPendingKey(category);
    // Optimistic update
    setRows((prev) =>
      prev.map((r) =>
        r.category === category
          ? { ...r, requiresManualReview: next, updatedAt: new Date().toISOString() }
          : r,
      ),
    );

    startSave(async () => {
      const res = await setCategoryReviewPolicy({
        category,
        requiresManualReview: next,
      });
      setPendingKey(null);
      if (!res.success) {
        // Rollback
        setRows((prev) =>
          prev.map((r) =>
            r.category === category
              ? { ...r, requiresManualReview: !next }
              : r,
          ),
        );
        toast.error(res.error ?? "Không lưu được");
        return;
      }
      toast.success(
        next
          ? `Đã bật manual review cho "${category}"`
          : `Đã tắt manual review cho "${category}"`,
      );
    });
  }

  const flaggedCount = rows.filter((r) => r.requiresManualReview).length;

  return (
    <div className="container mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center gap-2">
        <IconSnowflake className="size-6 text-blue-600" />
        <h1 className="text-2xl font-semibold">Danh mục cần duyệt thủ công</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cold-chain + manual-review categories</CardTitle>
          <CardDescription>
            Bật cho nhóm hàng cần kiểm tra thủ công mỗi lần nhập (thịt tươi,
            sữa, hải sản, v.v.). Mọi GRN có SKU thuộc nhóm đã bật sẽ{" "}
            <strong>không auto-approve</strong> (điều kiện c7 fail).
            <br />
            Hiện đang bật: <Badge variant="secondary">{flaggedCount}</Badge> /
            {" "}
            {rows.length} nhóm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có nhóm hàng nào trong catalog.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const busy = pendingKey === row.category;
                return (
                  <li
                    key={row.category}
                    className="flex items-center justify-between gap-3 rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`cat-${row.category}`}
                          className="font-medium"
                        >
                          {row.category}
                        </Label>
                        <Badge variant="outline" className="text-xs">
                          {row.itemCount} SKU
                        </Badge>
                        {row.requiresManualReview ? (
                          <Badge className="bg-blue-100 text-blue-900 border-blue-300 border text-xs">
                            Manual review
                          </Badge>
                        ) : null}
                      </div>
                      {row.updatedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cập nhật: {new Date(row.updatedAt).toLocaleString("vi-VN")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {busy ? <Spinner /> : null}
                      <Switch
                        id={`cat-${row.category}`}
                        checked={row.requiresManualReview}
                        disabled={busy}
                        onCheckedChange={(v) => handleToggle(row.category, v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

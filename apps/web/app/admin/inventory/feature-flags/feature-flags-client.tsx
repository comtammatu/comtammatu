"use client";

import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { Flag as IconFlag, Bolt as IconBolt, Info as IconInfoCircle } from "lucide-react";
import {
  setBranchFeatureFlag,
  bulkEnablePilotFlags,
  type FlagMatrix,
  type FlagMatrixCell,
} from "@/inventory/feature-flag-actions";

interface Props {
  matrix: FlagMatrix;
}

/**
 * Feature flag admin grid (S10 wiring gap — shipped post-hoc).
 *
 * Rows = inventory flags (7 so far), columns = active branches. Each cell
 * is a `<Switch>` flipping `branch_feature_flags.enabled`. RLS + server
 * action enforce `settings:branch` (branch-scoped) or `settings:tenant`
 * (tenant-wide).
 *
 * Owner-facing: no SQL required. "Bật pilot" quick action enables every
 * non-deferred inventory flag for the chosen branch in one click.
 */
export function FeatureFlagsClient({ matrix }: Props) {
  const [state, setState] = useState(matrix.state);
  const [pending, startTransition] = useTransition();

  function toggle(branchId: number, flagKey: string, next: boolean) {
    // Optimistic update
    setState((prev) => {
      const row = prev[flagKey] ?? {};
      return {
        ...prev,
        [flagKey]: {
          ...row,
          [branchId]: {
            enabled: next,
            enabledAt: new Date().toISOString(),
            enabledBy: row[branchId]?.enabledBy ?? null,
            enabledByName: row[branchId]?.enabledByName ?? null,
          },
        },
      };
    });

    startTransition(async () => {
      const res = await setBranchFeatureFlag({
        branchId,
        flagKey,
        enabled: next,
      });
      if (!res.success) {
        // Rollback optimistic UI
        setState((prev) => {
          const row = prev[flagKey] ?? {};
          return {
            ...prev,
            [flagKey]: {
              ...row,
              [branchId]: {
                ...row[branchId],
                enabled: !next,
              } as FlagMatrixCell,
            },
          };
        });
        toast.error(res.error ?? "Không đổi được flag");
        return;
      }
      toast.success(
        next ? "Đã bật feature flag" : "Đã tắt feature flag",
      );
    });
  }

  function bulkEnable(branchId: number) {
    startTransition(async () => {
      const res = await bulkEnablePilotFlags({ branchId });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không bulk-enable được");
        return;
      }
      toast.success(
        `Đã bật ${res.data.enabledCount} flag cho chi nhánh — refresh để cập nhật`,
      );
      // Optimistic: mark every non-deferred flag enabled for this branch
      setState((prev) => {
        const next = { ...prev };
        for (const meta of matrix.flags) {
          if (meta.sprint.includes("deferred")) continue;
          const row = next[meta.key] ?? {};
          next[meta.key] = {
            ...row,
            [branchId]: {
              enabled: true,
              enabledAt: new Date().toISOString(),
              enabledBy: row[branchId]?.enabledBy ?? null,
              enabledByName: row[branchId]?.enabledByName ?? null,
            },
          };
        }
        return next;
      });
    });
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <IconFlag className="size-6 text-warning-foreground" />
          Feature flags kho hàng
        </h1>
        <p className="text-sm text-muted-foreground">
          Bật/tắt từng module mới per chi nhánh. Module bị tắt sẽ tự redirect
          về UI legacy — code đã deploy, chỉ đổi cờ ở đây.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Ma trận branch × flag</CardTitle>
            <CardDescription>
              Nhấn switch để đổi trạng thái. Hover để xem ai bật/tắt lần cuối.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconInfoCircle className="size-4" />
            Cần quyền <code className="rounded bg-muted px-1">settings:branch</code>{" "}
            hoặc <code className="rounded bg-muted px-1">settings:tenant</code>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium">
                    Tính năng
                  </th>
                  {matrix.branches.map((b) => (
                    <th
                      key={b.id}
                      className="px-3 py-2 text-center font-medium"
                    >
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.flags.map((meta) => (
                  <tr
                    key={meta.key}
                    className="border-t align-middle"
                    data-flag-key={meta.key}
                  >
                    <td className="sticky left-0 z-10 bg-background px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-3xs">
                          {meta.sprint}
                        </Badge>
                        <span className="font-medium">{meta.label}</span>
                      </div>
                      <p className="mt-0.5 max-w-80 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                      <code className="mt-0.5 block text-2xs text-muted-foreground">
                        {meta.key}
                      </code>
                    </td>
                    {matrix.branches.map((b) => {
                      const cell = state[meta.key]?.[b.id];
                      const enabled = cell?.enabled ?? false;
                      const tooltip = cell
                        ? `${enabled ? "BẬT" : "TẮT"}${
                            cell.enabledByName
                              ? ` bởi ${cell.enabledByName}`
                              : ""
                          }${
                            cell.enabledAt
                              ? ` · ${formatDate(cell.enabledAt)}`
                              : ""
                          }`
                        : "Chưa có bản ghi (mặc định TẮT)";
                      const deferred = meta.sprint.includes("deferred");
                      return (
                        <td
                          key={b.id}
                          className="px-3 py-2 text-center"
                          title={tooltip}
                        >
                          <Switch
                            checked={enabled}
                            disabled={pending || deferred}
                            onCheckedChange={(next) =>
                              toggle(b.id, meta.key, next)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hành động nhanh — bật pilot</CardTitle>
          <CardDescription>
            Một click bật mọi flag non-deferred cho chi nhánh. Hữu ích khi
            onboarding pilot branch mới.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {matrix.branches.map((b) => (
              <Button
                key={b.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => bulkEnable(b.id)}
                disabled={pending}
                className={cn(
                  "gap-2",
                  pending && "opacity-60",
                )}
              >
                <IconBolt className="size-4 text-warning-foreground" />
                Bật pilot — {b.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

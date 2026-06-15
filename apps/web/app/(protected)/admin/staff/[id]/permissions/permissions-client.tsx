"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus as IconPlus,
  Trash as IconTrash,
  Layers as IconStack,
} from "lucide-react";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  applyTemplateAction,
  grantPermissionAction,
  revokePermissionAction,
} from "./actions";

interface BranchOpt {
  id: number;
  name: string;
  branchKind: string | null;
}

interface PermKey {
  key: string;
  module: string;
  description: string;
  scope: string;
}

interface Template {
  id: number;
  name: string;
  positionCode: string | null;
  permissionKeys: string[];
}

interface Grant {
  id: number;
  branchId: number | null;
  permissionKey: string;
  sourceTemplate: number | null;
  grantedAt: string;
  validUntil: string | null;
}

interface Props {
  targetUserId: string;
  targetFullName: string;
  currentGrants: Grant[];
  branches: BranchOpt[];
  permissionKeys: PermKey[];
  templates: Template[];
}

export function PermissionsClient({
  targetUserId,
  targetFullName,
  currentGrants,
  branches,
  permissionKeys,
  templates,
}: Props) {
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedPerm, setSelectedPerm] = useState<string>("");
  const [grantValidUntil, setGrantValidUntil] = useState<string>("");
  const [templateBranch, setTemplateBranch] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templateValidUntil, setTemplateValidUntil] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const tenantGrants = useMemo(
    () => currentGrants.filter((g) => g.branchId === null),
    [currentGrants],
  );
  const branchGrantsByBranch = useMemo(() => {
    const map = new Map<number, Grant[]>();
    for (const g of currentGrants) {
      if (g.branchId === null) continue;
      const list = map.get(g.branchId) ?? [];
      list.push(g);
      map.set(g.branchId, list);
    }
    return map;
  }, [currentGrants]);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const p of permissionKeys) set.add(p.module);
    return Array.from(set).sort();
  }, [permissionKeys]);

  function handleGrant() {
    if (!selectedBranch || !selectedPerm) {
      toast.error("Chọn chi nhánh và permission key.");
      return;
    }
    startTransition(async () => {
      const res = await grantPermissionAction({
        target_user_id: targetUserId,
        branch_id: Number(selectedBranch),
        permission_key: selectedPerm,
        valid_until: grantValidUntil ? toIsoZ(grantValidUntil) : null,
      });
      if (!res.success) {
        toast.error(res.error ?? "Thất bại");
      } else {
        toast.success(`Đã gán ${selectedPerm}`);
        setSelectedPerm("");
        setGrantValidUntil("");
      }
    });
  }

  async function handleRevoke(grant: Grant) {
    const description = permissionKeys.find(
      (p) => p.key === grant.permissionKey,
    )?.description;
    const ok = await confirm({
      title: "Thu hồi quyền này?",
      description:
        "Nhân viên sẽ mất quyền truy cập tương ứng ngay sau khi thu hồi.",
      details: [
        { label: "Permission key", value: grant.permissionKey },
        ...(description ? [{ label: "Mô tả", value: description }] : []),
      ],
      confirmText: "Thu hồi",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokePermissionAction({
        target_user_id: targetUserId,
        branch_id: grant.branchId,
        permission_key: grant.permissionKey,
      });
      if (!res.success) {
        toast.error(res.error ?? "Thất bại");
      } else {
        toast.success(`Đã thu hồi ${grant.permissionKey}`);
      }
    });
  }

  function handleApplyTemplate() {
    if (!templateBranch || !templateId) {
      toast.error("Chọn chi nhánh và template.");
      return;
    }
    startTransition(async () => {
      const res = await applyTemplateAction({
        target_user_id: targetUserId,
        branch_id: Number(templateBranch),
        template_id: Number(templateId),
        valid_until: templateValidUntil ? toIsoZ(templateValidUntil) : null,
      });
      if (!res.success) {
        toast.error(res.error ?? "Thất bại");
      } else {
        toast.success(
          `Đã áp dụng template (${res.data?.rows_inserted ?? 0} quyền mới)`,
        );
        setTemplateId("");
        setTemplateValidUntil("");
      }
    });
  }

  /** Convert datetime-local value (no tz) to ISO 8601 with offset. */
  function toIsoZ(local: string): string {
    // local is "YYYY-MM-DDTHH:mm" — treat as local time, emit UTC ISO.
    return new Date(local).toISOString();
  }

  return (
    <div className="space-y-5">
      {/* ─── Grant individual permission ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Gán quyền đơn lẻ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger>
                <SelectValue placeholder="Chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPerm} onValueChange={setSelectedPerm}>
              <SelectTrigger className="sm:col-span-2">
                <SelectValue placeholder="Permission key" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((mod) => (
                  <div key={mod}>
                    <div className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                      {mod}
                    </div>
                    {permissionKeys
                      .filter((p) => p.module === mod)
                      .map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          <div className="flex min-w-0 flex-col items-start gap-0.5">
                            <span className="font-mono text-xs">{p.key}</span>
                            <span className="break-words text-xs text-muted-foreground">
                              {p.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Hạn kết thúc (tuỳ chọn)
              <input
                type="datetime-local"
                value={grantValidUntil}
                onChange={(e) => setGrantValidUntil(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </label>
            <p className="self-end text-xs text-muted-foreground">
              Để trống = vĩnh viễn. Dùng cho luân chuyển tạm hoặc uỷ quyền có
              hạn.
            </p>
          </div>
          <Button
            onClick={handleGrant}
            disabled={isPending || !selectedBranch || !selectedPerm}
          >
            <IconPlus className="mr-1 size-4" />
            Gán quyền
          </Button>
        </CardContent>
      </Card>

      {/* ─── Apply template ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Áp dụng template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={templateBranch} onValueChange={setTemplateBranch}>
              <SelectTrigger>
                <SelectValue placeholder="Chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="sm:col-span-2">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} ({t.permissionKeys.length} quyền)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Hạn kết thúc (tuỳ chọn)
            <input
              type="datetime-local"
              value={templateValidUntil}
              onChange={(e) => setTemplateValidUntil(e.target.value)}
              className="max-w-xs rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Template cộng dồn với quyền hiện có — chỉ thêm, không xóa. Nếu đặt
            hạn, tất cả quyền mới cùng hạn.
          </p>
          <Button
            onClick={handleApplyTemplate}
            disabled={isPending || !templateBranch || !templateId}
            variant="secondary"
          >
            <IconStack className="mr-1 size-4" />
            Áp dụng
          </Button>
        </CardContent>
      </Card>

      {/* ─── Current grants — tenant-wide ─── */}
      {tenantGrants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quyền tenant-wide ({tenantGrants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <GrantList
              grants={tenantGrants}
              onRevoke={handleRevoke}
              disabled={isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── Current grants — per branch ─── */}
      {branches.map((b) => {
        const list = branchGrantsByBranch.get(b.id) ?? [];
        if (list.length === 0) return null;
        return (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle>
                {b.name} ({list.length} quyền)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GrantList
                grants={list}
                onRevoke={handleRevoke}
                disabled={isPending}
              />
            </CardContent>
          </Card>
        );
      })}

      {currentGrants.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {targetFullName} chưa có quyền nào. Gán đơn lẻ hoặc áp dụng template
            ở trên.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GrantList({
  grants,
  onRevoke,
  disabled,
}: {
  grants: Grant[];
  onRevoke: (g: Grant) => void;
  disabled: boolean;
}) {
  const now = Date.now();
  return (
    <ul className="flex flex-wrap gap-2">
      {grants.map((g) => {
        const expiry = g.validUntil ? new Date(g.validUntil).getTime() : null;
        const expired = expiry !== null && expiry <= now;
        const expiringSoon =
          expiry !== null && !expired && expiry - now < 24 * 60 * 60 * 1000;
        return (
          <li
            key={g.id}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
              expired
                ? "border-destructive/40 bg-destructive/10"
                : expiringSoon
                  ? "border-warning/40 bg-warning/10"
                  : "border-border/60 bg-muted/30"
            }`}
          >
            <Badge variant="secondary" className="font-mono text-xs">
              {g.permissionKey}
            </Badge>
            {g.validUntil && (
              <span
                className={`text-xs ${
                  expired
                    ? "text-destructive"
                    : expiringSoon
                      ? "text-warning"
                      : "text-muted-foreground"
                }`}
                title={formatVNDateTime(g.validUntil)}
              >
                {expired ? "hết hạn" : "đến"} {formatVNDate(g.validUntil)}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={disabled}
              onClick={() => onRevoke(g)}
            >
              <IconTrash className="size-3.5 text-destructive" />
              <span className="sr-only">Thu hồi</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

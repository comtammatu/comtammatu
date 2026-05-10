"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import {
  activatePrintTemplateVersion,
  savePrintTemplateVersion,
} from "./actions";

export type PrintTemplateKind =
  | "receipt"
  | "provisional_bill"
  | "kitchen_ticket"
  | "cancel_ticket"
  | "shift_close_report"
  | "tax_invoice";

export type BranchOption = {
  id: number;
  name: string;
};

export type TemplateRow = {
  id: number;
  tenant_id: number | null;
  branch_id: number | null;
  kind: PrintTemplateKind;
  version: number;
  name: string;
  paper_width_mm: number;
  font_profile: string;
  content: unknown;
  is_active: boolean;
  updated_at: string;
  created_at: string;
};

type ScopeKey = "tenant" | `branch:${number}`;

const TEMPLATE_KINDS: Array<{
  value: PrintTemplateKind;
  label: string;
  description: string;
}> = [
  {
    value: "kitchen_ticket",
    label: "Phiếu bếp",
    description: "Header, thông tin đơn, bảng món, ghi chú bếp",
  },
  {
    value: "provisional_bill",
    label: "Phiếu tạm tính",
    description: "Bill trước thanh toán, tổng tiền và QR thanh toán",
  },
  {
    value: "receipt",
    label: "Hóa đơn thanh toán",
    description: "Bill sau thanh toán, phương thức trả tiền và tiền thối",
  },
  {
    value: "tax_invoice",
    label: "Thông tin HĐĐT",
    description: "Thông tin tra cứu hóa đơn điện tử đã phát hành",
  },
  {
    value: "cancel_ticket",
    label: "Phiếu hủy / giảm món",
    description: "Thông tin món hủy hoặc giảm số lượng cho bếp",
  },
  {
    value: "shift_close_report",
    label: "Phiếu chốt ca",
    description: "Tổng kết ca POS và chênh lệch quỹ",
  },
];

const TEMPLATE_KIND_LABEL = Object.fromEntries(
  TEMPLATE_KINDS.map((kind) => [kind.value, kind.label]),
) as Record<PrintTemplateKind, string>;

const TEMPLATE_COPY = {
  scopeTenant: "Toàn hệ thống",
  scopeSystem: "Mặc định hệ thống",
  editorTitle: "Chỉnh mẫu in",
  editorDescription:
    "Mỗi lần lưu sẽ tạo version mới và kích hoạt cho scope đang chọn. Job đã tạo trước đó vẫn giữ snapshot cũ.",
  kindLabel: "Loại phiếu",
  scopeLabel: "Phạm vi áp dụng",
  nameLabel: "Tên version",
  paperLabel: "Khổ giấy",
  fontLabel: "Font profile",
  contentLabel: "Document JSON",
  historyTitle: "Lịch sử version",
  historyDescription:
    "Có thể nạp lại version cũ để chỉnh tiếp hoặc kích hoạt lại version tenant/chi nhánh.",
  active: "Đang dùng",
  fallback: "Fallback",
  inactive: "Không active",
  load: "Nạp",
  activate: "Kích hoạt",
  save: "Lưu version mới",
  saving: "Đang lưu...",
  activating: "Đang kích hoạt...",
  invalidJson: "JSON không hợp lệ",
  saved: "Đã lưu và kích hoạt mẫu in",
  activated: "Đã kích hoạt mẫu in",
  noTemplates: "Chưa có version nào cho loại phiếu này",
} as const;

function scopeKeyForTemplate(row: TemplateRow): "global" | ScopeKey {
  if (row.tenant_id == null) return "global";
  if (row.branch_id == null) return "tenant";
  return `branch:${row.branch_id}`;
}

function branchIdFromScope(scope: ScopeKey): number | null {
  if (scope === "tenant") return null;
  return Number(scope.slice("branch:".length));
}

function formatContent(content: unknown): string {
  return JSON.stringify(content ?? { blocks: [] }, null, 2);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

function defaultName(kind: PrintTemplateKind, scopeLabel: string): string {
  return `${TEMPLATE_KIND_LABEL[kind]} - ${scopeLabel}`;
}

export function PrintTemplatesClient({
  templates,
  branches,
}: {
  templates: TemplateRow[];
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [selectedKind, setSelectedKind] =
    useState<PrintTemplateKind>("kitchen_ticket");
  const [selectedScope, setSelectedScope] = useState<ScopeKey>("tenant");
  const [name, setName] = useState("");
  const [paperWidthMm, setPaperWidthMm] = useState<58 | 80>(80);
  const [fontProfile, setFontProfile] = useState("thermal_vietnamese");
  const [contentText, setContentText] = useState("{\n  \"blocks\": []\n}");
  const [loadedTemplateId, setLoadedTemplateId] = useState<number | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<number | null>(
    null,
  );
  const [isSaving, startSave] = useTransition();
  const [isActivating, startActivate] = useTransition();

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const scopeOptions = useMemo(
    () => [
      { value: "tenant" as ScopeKey, label: TEMPLATE_COPY.scopeTenant },
      ...branches.map((branch) => ({
        value: `branch:${branch.id}` as ScopeKey,
        label: branch.name,
      })),
    ],
    [branches],
  );

  const selectedScopeLabel =
    scopeOptions.find((scope) => scope.value === selectedScope)?.label ??
    TEMPLATE_COPY.scopeTenant;

  const activeTemplates = useMemo(
    () =>
      templates.filter(
        (template) => template.kind === selectedKind && template.is_active,
      ),
    [selectedKind, templates],
  );

  const effectiveTemplate = useMemo(() => {
    const branchId = branchIdFromScope(selectedScope);
    const branchTemplate =
      branchId == null
        ? null
        : activeTemplates.find(
            (template) =>
              template.tenant_id != null && template.branch_id === branchId,
          );
    return (
      branchTemplate ??
      activeTemplates.find(
        (template) =>
          template.tenant_id != null && template.branch_id == null,
      ) ??
      activeTemplates.find((template) => template.tenant_id == null) ??
      null
    );
  }, [activeTemplates, selectedScope]);

  const visibleVersions = useMemo(() => {
    const branchId = branchIdFromScope(selectedScope);
    return templates
      .filter((template) => template.kind === selectedKind)
      .filter((template) => {
        if (template.tenant_id == null) return true;
        if (template.branch_id == null) return true;
        return branchId != null && template.branch_id === branchId;
      })
      .sort((a, b) => {
        const activeDelta = Number(b.is_active) - Number(a.is_active);
        if (activeDelta !== 0) return activeDelta;
        return b.version - a.version;
      });
  }, [selectedKind, selectedScope, templates]);

  useEffect(() => {
    const source = effectiveTemplate;
    if (!source) {
      setName(defaultName(selectedKind, selectedScopeLabel));
      setPaperWidthMm(80);
      setFontProfile("thermal_vietnamese");
      setContentText("{\n  \"blocks\": []\n}");
      setLoadedTemplateId(null);
      return;
    }

    setName(defaultName(selectedKind, selectedScopeLabel));
    setPaperWidthMm(source.paper_width_mm === 58 ? 58 : 80);
    setFontProfile(source.font_profile);
    setContentText(formatContent(source.content));
    setLoadedTemplateId(source.id);
  }, [effectiveTemplate, selectedKind, selectedScopeLabel]);

  const scopeLabelForRow = (row: TemplateRow): string => {
    const key = scopeKeyForTemplate(row);
    if (key === "global") return TEMPLATE_COPY.scopeSystem;
    if (key === "tenant") return TEMPLATE_COPY.scopeTenant;
    return branchById.get(row.branch_id ?? 0) ?? `Chi nhánh #${row.branch_id}`;
  };

  const loadTemplate = (row: TemplateRow) => {
    setSelectedKind(row.kind);
    const scopeKey = scopeKeyForTemplate(row);
    if (scopeKey !== "global") setSelectedScope(scopeKey);
    setName(defaultName(row.kind, scopeLabelForRow(row)));
    setPaperWidthMm(row.paper_width_mm === 58 ? 58 : 80);
    setFontProfile(row.font_profile);
    setContentText(formatContent(row.content));
    setLoadedTemplateId(row.id);
  };

  const handleSave = () => {
    let normalizedContent: string;
    try {
      normalizedContent = JSON.stringify(JSON.parse(contentText), null, 2);
    } catch {
      toast.error(TEMPLATE_COPY.invalidJson);
      return;
    }

    startSave(async () => {
      const result = await savePrintTemplateVersion({
        kind: selectedKind,
        branchId: branchIdFromScope(selectedScope),
        name,
        paperWidthMm,
        fontProfile,
        contentText: normalizedContent,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể lưu mẫu in");
        return;
      }
      toast.success(TEMPLATE_COPY.saved);
      setContentText(normalizedContent);
      router.refresh();
    });
  };

  const handleActivate = (templateId: number) => {
    setPendingTemplateId(templateId);
    startActivate(async () => {
      const result = await activatePrintTemplateVersion({ id: templateId });
      setPendingTemplateId(null);
      if (!result.success) {
        toast.error(result.error ?? "Không thể kích hoạt mẫu in");
        return;
      }
      toast.success(TEMPLATE_COPY.activated);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      <AppSection
        title={TEMPLATE_COPY.editorTitle}
        description={TEMPLATE_COPY.editorDescription}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{TEMPLATE_COPY.kindLabel}</Label>
            <Select
              value={selectedKind}
              onValueChange={(value) =>
                setSelectedKind(value as PrintTemplateKind)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_KINDS.map((kind) => (
                  <SelectItem key={kind.value} value={kind.value}>
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                TEMPLATE_KINDS.find((kind) => kind.value === selectedKind)
                  ?.description
              }
            </p>
          </div>

          <div className="space-y-2">
            <Label>{TEMPLATE_COPY.scopeLabel}</Label>
            <Select
              value={selectedScope}
              onValueChange={(value) => setSelectedScope(value as ScopeKey)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((scope) => (
                  <SelectItem key={scope.value} value={scope.value}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {effectiveTemplate
                ? `${TEMPLATE_COPY.fallback}: ${scopeLabelForRow(effectiveTemplate)} v${effectiveTemplate.version}`
                : TEMPLATE_COPY.noTemplates}
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>{TEMPLATE_COPY.nameLabel}</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{TEMPLATE_COPY.paperLabel}</Label>
            <Select
              value={String(paperWidthMm)}
              onValueChange={(value) =>
                setPaperWidthMm(Number(value) === 58 ? 58 : 80)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="80">80mm</SelectItem>
                <SelectItem value="58">58mm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{TEMPLATE_COPY.fontLabel}</Label>
            <Input
              value={fontProfile}
              onChange={(event) => setFontProfile(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{TEMPLATE_COPY.contentLabel}</Label>
            {loadedTemplateId ? (
              <Badge variant="outline">#{loadedTemplateId}</Badge>
            ) : null}
          </div>
          <Textarea
            value={contentText}
            onChange={(event) => setContentText(event.target.value)}
            rows={22}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? TEMPLATE_COPY.saving : TEMPLATE_COPY.save}
          </Button>
        </div>
      </AppSection>

      <AppSection
        title={TEMPLATE_COPY.historyTitle}
        description={TEMPLATE_COPY.historyDescription}
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{TEMPLATE_COPY.scopeLabel}</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>{TEMPLATE_COPY.nameLabel}</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleVersions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  {TEMPLATE_COPY.noTemplates}
                </TableCell>
              </TableRow>
            ) : (
              visibleVersions.map((template) => {
                const isTenantOwned = template.tenant_id != null;
                const isPendingThis = pendingTemplateId === template.id;
                return (
                  <TableRow key={template.id}>
                    <TableCell>{scopeLabelForRow(template)}</TableCell>
                    <TableCell className="font-mono">
                      v{template.version}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(template.updated_at)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge variant="default">{TEMPLATE_COPY.active}</Badge>
                      ) : (
                        <Badge variant="outline">
                          {TEMPLATE_COPY.inactive}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadTemplate(template)}
                        >
                          {TEMPLATE_COPY.load}
                        </Button>
                        {isTenantOwned && !template.is_active ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={isActivating}
                            onClick={() => handleActivate(template.id)}
                          >
                            {isPendingThis
                              ? TEMPLATE_COPY.activating
                              : TEMPLATE_COPY.activate}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </AppSection>
    </div>
  );
}

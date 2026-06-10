"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR checklist template builder copy is local to this new workflow */

import { useMemo, useState, useTransition } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui/lib/utils";
import type { BranchOption } from "./page";
import {
  archiveChecklistTemplate,
  fetchChecklistTemplates,
  saveChecklistTemplate,
} from "./checklist-actions";
import {
  CHECKLIST_PHASE_LABELS,
  CHECKLIST_PHASES,
  checklistTemplateLabel,
  type ChecklistPhase,
  type ChecklistTemplateItem,
  type ChecklistTemplateRow,
} from "./checklist-types";

interface ChecklistTemplatesTableProps {
  branches: BranchOption[];
  initialTemplates: ChecklistTemplateRow[];
  canManageGlobalChecklist: boolean;
}

type DraftItem = Omit<ChecklistTemplateItem, "id"> & { id?: number };

interface DraftState {
  templateId: number | null;
  name: string;
  branchId: number | null;
  items: DraftItem[];
}

const EMPTY_ITEM: DraftItem = {
  title: "",
  phase: "dau_ca",
  doneDefinition: "",
  isRequired: true,
  sortOrder: 1,
};

function newDraft(branchId: number | null): DraftState {
  return {
    templateId: null,
    name: "",
    branchId,
    items: [{ ...EMPTY_ITEM }],
  };
}

function toDraft(template: ChecklistTemplateRow, cloneToBranchId?: number): DraftState {
  return {
    templateId: cloneToBranchId == null ? template.id : null,
    name: cloneToBranchId == null ? template.name : `${template.name} - Chi nhánh`,
    branchId: cloneToBranchId ?? template.branchId,
    items: template.items.map((item, index) => ({
      title: item.title,
      phase: item.phase,
      doneDefinition: item.doneDefinition,
      isRequired: item.isRequired,
      sortOrder: index + 1,
    })),
  };
}

function sortTemplates(templates: ChecklistTemplateRow[]) {
  return [...templates].sort((a, b) => {
    if (a.branchId == null && b.branchId != null) return -1;
    if (a.branchId != null && b.branchId == null) return 1;
    return a.name.localeCompare(b.name, "vi");
  });
}

export function ChecklistTemplatesTable({
  branches,
  initialTemplates,
  canManageGlobalChecklist,
}: ChecklistTemplatesTableProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isPending, startTransition] = useTransition();
  const sortedTemplates = useMemo(() => sortTemplates(templates), [templates]);
  const firstBranchId = branches[0]?.id ?? null;

  function openCreate(branchId: number | null) {
    setDraft(newDraft(branchId));
  }

  function openEdit(template: ChecklistTemplateRow) {
    setDraft(toDraft(template));
  }

  function openClone(template: ChecklistTemplateRow) {
    if (firstBranchId == null) {
      toast.error("Chưa có chi nhánh để clone template.");
      return;
    }
    setDraft(toDraft(template, firstBranchId));
  }

  function updateDraft(patch: Partial<DraftState>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        ),
      };
    });
  }

  function addItem() {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: [
          ...current.items,
          {
            ...EMPTY_ITEM,
            phase: "trong_ca",
            sortOrder: current.items.length + 1,
          },
        ],
      };
    });
  }

  function removeItem(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const next = current.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        items: (next.length > 0 ? next : [{ ...EMPTY_ITEM }]).map(
          (item, itemIndex) => ({
            ...item,
            sortOrder: itemIndex + 1,
          }),
        ),
      };
    });
  }

  function handleSave() {
    if (!draft) return;

    const items = draft.items
      .map((item) => ({
        title: item.title.trim(),
        phase: item.phase,
        doneDefinition: item.doneDefinition.trim(),
        isRequired: item.isRequired,
      }))
      .filter((item) => item.title.length > 0);

    if (draft.name.trim().length === 0 || items.length === 0) {
      toast.error("Nhập tên template và ít nhất một việc.");
      return;
    }

    startTransition(async () => {
      const result = await saveChecklistTemplate({
        templateId: draft.templateId,
        branchId: draft.branchId,
        name: draft.name.trim(),
        items,
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể lưu checklist template.");
        return;
      }

      toast.success("Đã lưu checklist template.");
      setDraft(null);
      const refreshed = await fetchChecklistTemplates();
      if (refreshed.success) {
        setTemplates(refreshed.data ?? []);
      }
    });
  }

  function handleArchive(template: ChecklistTemplateRow) {
    startTransition(async () => {
      const result = await archiveChecklistTemplate({ templateId: template.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể ngưng dùng template.");
        return;
      }
      toast.success("Đã ngưng dùng template.");
      setTemplates((current) =>
        current.filter((item) => item.id !== template.id),
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {templates.length} template
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageGlobalChecklist ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => openCreate(null)}
            >
              <Plus className="mr-2 size-4" />
              Global
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={firstBranchId == null}
            onClick={() => openCreate(firstBranchId)}
          >
            <Plus className="mr-2 size-4" />
            Chi nhánh
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên template</TableHead>
              <TableHead>Phạm vi</TableHead>
              <TableHead className="text-center">Việc</TableHead>
              <TableHead>Phase</TableHead>
              <TableHead className="w-36 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTemplates.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Chưa có checklist template.
                </TableCell>
              </TableRow>
            ) : (
              sortedTemplates.map((template) => {
                const phaseCounts = CHECKLIST_PHASES.map((phase) => ({
                  phase,
                  count: template.items.filter((item) => item.phase === phase)
                    .length,
                }));

                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant={template.branchId == null ? "default" : "outline"}>
                        {template.branchId == null
                          ? "Global"
                          : (template.branchName ?? "Chi nhánh")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {template.itemCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {phaseCounts.map(({ phase, count }) => (
                          <Badge
                            key={phase}
                            variant="secondary"
                            className={cn(count === 0 && "opacity-50")}
                          >
                            {CHECKLIST_PHASE_LABELS[phase]} {count}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {template.branchId == null && branches.length > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isPending}
                            onClick={() => openClone(template)}
                            aria-label="Clone template"
                          >
                            <Copy className="size-4" />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            isPending ||
                            (template.branchId == null &&
                              !canManageGlobalChecklist)
                          }
                          onClick={() => openEdit(template)}
                          aria-label="Sửa template"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            isPending ||
                            (template.branchId == null &&
                              !canManageGlobalChecklist)
                          }
                          onClick={() => handleArchive(template)}
                          aria-label="Ngưng dùng template"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-dvh-90 overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.templateId ? "Sửa checklist template" : "Tạo checklist template"}
            </DialogTitle>
            <DialogDescription>
              Template mới chỉ áp dụng cho lần chấm công sau; checklist đã snapshot
              không đổi.
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
                <div className="space-y-2">
                  <Label htmlFor="checklist-template-name">Tên template</Label>
                  <Input
                    id="checklist-template-name"
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft({ name: event.target.value })
                    }
                    placeholder="Quầy, Phục vụ, Nướng"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="checklist-template-scope">Phạm vi</Label>
                  <Select
                    value={draft.branchId?.toString() ?? "global"}
                    disabled={draft.templateId !== null}
                    onValueChange={(value) =>
                      updateDraft({
                        branchId: value === "global" ? null : Number(value),
                      })
                    }
                  >
                    <SelectTrigger id="checklist-template-scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canManageGlobalChecklist ? (
                        <SelectItem value="global">Global</SelectItem>
                      ) : null}
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id.toString()}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Danh sách việc</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-2 size-4" />
                    Thêm việc
                  </Button>
                </div>

                <div className="space-y-3">
                  {draft.items.map((item, index) => (
                    <div key={index} className="rounded-md border p-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_150px_120px_auto]">
                        <div className="space-y-2">
                          <Label htmlFor={`checklist-item-${index}`}>
                            Việc
                          </Label>
                          <Input
                            id={`checklist-item-${index}`}
                            value={item.title}
                            onChange={(event) =>
                              updateItem(index, { title: event.target.value })
                            }
                            placeholder="Tên việc cần làm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Phase</Label>
                          <Select
                            value={item.phase}
                            onValueChange={(value) =>
                              updateItem(index, {
                                phase: value as ChecklistPhase,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHECKLIST_PHASES.map((phase) => (
                                <SelectItem key={phase} value={phase}>
                                  {CHECKLIST_PHASE_LABELS[phase]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <label className="flex items-end gap-2 pb-2 text-sm">
                          <Checkbox
                            checked={item.isRequired}
                            onCheckedChange={(checked) =>
                              updateItem(index, {
                                isRequired: checked === true,
                              })
                            }
                          />
                          Bắt buộc
                        </label>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="self-end"
                          onClick={() => removeItem(index)}
                          aria-label="Xóa việc"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label htmlFor={`checklist-definition-${index}`}>
                          Tiêu chí xong
                        </Label>
                        <Textarea
                          id={`checklist-definition-${index}`}
                          value={item.doneDefinition}
                          onChange={(event) =>
                            updateItem(index, {
                              doneDefinition: event.target.value,
                            })
                          }
                          placeholder="Dấu hiệu để quản lý và nhân viên biết việc đã xong"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {draft.branchId == null
                  ? "Global template dùng làm mẫu chung."
                  : checklistTemplateLabel({
                      name: draft.name || "Template",
                      branchId: draft.branchId,
                      branchName:
                        branches.find((branch) => branch.id === draft.branchId)
                          ?.name ?? null,
                    })}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? <Spinner className="mr-2 size-4" /> : null}
              Lưu template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

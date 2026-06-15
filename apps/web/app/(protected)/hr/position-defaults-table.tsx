"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR position-default checklist table operational copy */

import { useState, useTransition } from "react";
import { Briefcase as IconBriefcase } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { setPositionDefaultChecklist } from "./checklist-actions";
import type {
  ChecklistTemplateRow,
  PositionDefaultRow,
} from "./checklist-types";

interface PositionDefaultsTableProps {
  positions: PositionDefaultRow[];
  templates: ChecklistTemplateRow[];
}

export function PositionDefaultsTable({
  positions,
  templates,
}: PositionDefaultsTableProps) {
  const [rows, setRows] = useState(positions);
  const [isPending, startTransition] = useTransition();

  const globalTemplates = templates.filter(
    (template) => template.branchId == null && template.isActive,
  );

  function updateDefault(positionId: number, value: string) {
    const templateId = value === "none" ? null : Number(value);
    const previous = rows;
    setRows((current) =>
      current.map((position) =>
        position.id === positionId
          ? { ...position, default_checklist_template_id: templateId }
          : position,
      ),
    );

    startTransition(async () => {
      const result = await setPositionDefaultChecklist({
        positionId,
        templateId,
      });
      if (!result.success) {
        setRows(previous);
        toast.error(
          result.error ?? "Không thể cập nhật checklist theo vị trí.",
        );
        return;
      }
      toast.success("Đã cập nhật checklist theo vị trí.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Checklist mặc định theo vị trí</h3>
        <p className="text-sm text-muted-foreground">
          Nhân viên không có checklist riêng sẽ dùng mặc định của vị trí. Chỉ
          gán được checklist Global.
        </p>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vị trí</TableHead>
              <TableHead>Checklist mặc định</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableEmptyStateRow
                colSpan={2}
                title="Chưa có vị trí nào"
                icon={
                  <IconBriefcase className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {rows.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-medium">
                  {position.label_vi ?? position.code}
                </TableCell>
                <TableCell>
                  <Select
                    value={
                      position.default_checklist_template_id?.toString() ??
                      "none"
                    }
                    disabled={isPending}
                    onValueChange={(value) => updateDefault(position.id, value)}
                  >
                    <SelectTrigger className="w-full min-w-48">
                      <SelectValue placeholder="Không gán" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Không gán</SelectItem>
                      {globalTemplates.map((template) => (
                        <SelectItem
                          key={template.id}
                          value={template.id.toString()}
                        >
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

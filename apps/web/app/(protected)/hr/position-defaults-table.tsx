"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR position-default checklist table operational copy */

import { useState, useTransition } from "react";
import { Briefcase as IconBriefcase } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
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

  function getTemplateName(templateId: number | null) {
    if (!templateId) return "Không gán";
    return (
      globalTemplates.find((template) => template.id === templateId)?.name ??
      "Không gán"
    );
  }

  function renderTemplateSelect(position: PositionDefaultRow) {
    return (
      <Select
        value={position.default_checklist_template_id?.toString() ?? "none"}
        disabled={isPending}
        onValueChange={(value) => updateDefault(position.id, value)}
      >
        <SelectTrigger className="w-full min-w-48">
          <SelectValue placeholder="Không gán" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Không gán</SelectItem>
          {globalTemplates.map((template) => (
            <SelectItem key={template.id} value={template.id.toString()}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const columns: DataTableColumn<PositionDefaultRow>[] = [
    {
      key: "position",
      header: "Vị trí",
      render: (position) => (
        <span className="font-medium">
          {position.label_vi ?? position.code}
        </span>
      ),
    },
    {
      key: "checklist",
      header: "Checklist mặc định",
      render: renderTemplateSelect,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Checklist mặc định theo vị trí</h3>
        <p className="text-sm text-muted-foreground">
          Nhân viên không có checklist riêng sẽ dùng mặc định của vị trí. Chỉ
          gán được checklist Global.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(position) => position.id}
        emptyTitle="Chưa có vị trí nào"
        emptyIcon={<IconBriefcase />}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(position) => (
          <Item variant="outline" className={isPending ? "opacity-60" : ""}>
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {position.label_vi ?? position.code}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {getTemplateName(position.default_checklist_template_id)}
              </ItemDescription>
              <div>{renderTemplateSelect(position)}</div>
            </ItemContent>
          </Item>
        )}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Plus as IconPlus, Pencil as IconPencil } from "lucide-react";
import { StationFormDialog } from "./station-form-dialog";
import { EmptyStatePanel } from "../../components/empty-state-panel";

/* ─── Types ─── */

import { BRANCH_VI } from "@comtammatu/shared/messages";
export interface StationRow {
  id: number;
  name: string;
  branch_id: number;
  position: number;
  is_active: boolean;
  category_ids: number[];
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

export interface CategoryOption {
  id: number;
  name: string;
  type: string;
  sort_order: number;
}

interface StationsClientProps {
  branches: BranchOption[];
  stations: StationRow[];
  categories: CategoryOption[];
}

/* ─── Component ─── */

export function StationsClient({
  branches,
  stations,
  categories,
}: StationsClientProps) {
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Remount dialog to reset useActionState — stale success + create flow wiped category rows */
  const [dialogSession, setDialogSession] = useState(0);
  const [editStation, setEditStation] = useState<StationRow | null>(null);

  const filteredStations = stations.filter(
    (s) => s.branch_id === selectedBranchId,
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  if (branches.length === 0) {
    return (
      <EmptyStatePanel
        title="Chưa có chi nhánh nào"
        description="Tạo chi nhánh trước."
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Chi nhánh:</label>
        <Select
          value={selectedBranchId?.toString() ?? ""}
          onValueChange={(v) => setSelectedBranchId(Number(v))}
        >
          <SelectTrigger className="w-60">
            <SelectValue placeholder={BRANCH_VI.select} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditStation(null);
              setDialogOpen(true);
            }}
          >
            <IconPlus className="mr-2 size-4" />
            Thêm trạm
          </Button>
        </div>

        {filteredStations.length === 0 ? (
          <EmptyStatePanel
            className="py-8"
            title="Chưa có trạm KDS nào cho chi nhánh này"
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50">Tên trạm</TableHead>
                  <TableHead className="w-25 text-center">Thứ tự</TableHead>
                  <TableHead>Danh mục món ăn</TableHead>
                  <TableHead className="w-25 text-center">Trạng thái</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStations.map((station) => (
                  <TableRow key={station.id}>
                    <TableCell className="font-medium">
                      {station.name}
                    </TableCell>
                    <TableCell className="text-center">
                      {station.position}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {station.category_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Tất cả (fallback)
                          </span>
                        ) : (
                          station.category_ids.map((catId) => (
                            <Badge
                              key={catId}
                              variant="secondary"
                              className="text-xs"
                            >
                              {categoryMap.get(catId) ?? `#${String(catId)}`}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={station.is_active ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {station.is_active ? "Hoạt động" : "Tạm tắt"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditStation(station);
                          setDialogOpen(true);
                        }}
                      >
                        <IconPencil className="size-4" />
                        <span className="sr-only">Chỉnh sửa</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedBranchId !== null && (
        <StationFormDialog
          key={dialogSession}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setDialogSession((s) => s + 1);
            }
          }}
          branchId={selectedBranchId}
          station={editStation}
          categories={categories}
        />
      )}
    </>
  );
}

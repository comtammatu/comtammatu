"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Card } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Badge } from "@comtammatu/ui/components/badge";
import { Plus as IconPlus, X as IconX, MapPin as IconMapPin } from "lucide-react";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  createArea,
  assignBranchToArea,
  removeBranchFromArea,
} from "./actions";
import { EmptyStatePanel } from "../../components/empty-state-panel";

interface AreaBranch {
  id: number;
  branch_id: number;
  branches: { id: number; name: string } | null;
}

export interface Area {
  id: number;
  name: string;
  is_active: boolean;
  area_branches: AreaBranch[];
}

interface AreasManagerProps {
  areas: Area[];
  branches: { id: number; name: string }[];
}

export function AreasManager({ areas, branches }: AreasManagerProps) {
  const [newAreaName, setNewAreaName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCreateArea = () => {
    if (!newAreaName.trim()) return;
    startTransition(async () => {
      const result = await createArea({ name: newAreaName.trim() });
      if (result.success) {
        setNewAreaName("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Có lỗi xảy ra, vui lòng thử lại");
      }
    });
  };

  const handleAssignBranch = (areaId: number, branchId: number) => {
    startTransition(async () => {
      const result = await assignBranchToArea({ areaId, branchId });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error ?? "Có lỗi xảy ra, vui lòng thử lại");
      }
    });
  };

  const handleRemoveBranch = (areaBranchId: number) => {
    startTransition(async () => {
      const result = await removeBranchFromArea({ areaBranchId });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error ?? "Có lỗi xảy ra, vui lòng thử lại");
      }
    });
  };

  // Branches already assigned to any area
  const assignedBranchIds = new Set(
    areas.flatMap((a) => a.area_branches.map((ab) => ab.branch_id)),
  );

  return (
    <div className="space-y-4">
      {/* Create new area */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Tên khu vực mới..."
          value={newAreaName}
          onChange={(e) => setNewAreaName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateArea()}
          className="max-w-xs"
        />
        <Button
          size="sm"
          onClick={handleCreateArea}
          disabled={isPending || !newAreaName.trim()}
        >
          <IconPlus className="mr-1 size-4" />
          Tạo khu vực
        </Button>
      </div>

      {/* Area list */}
      {areas.length === 0 ? (
        <EmptyStatePanel
          title="Chưa có khu vực nào"
          icon={<IconMapPin className="size-10 text-muted-foreground" />}
          className="p-8"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {areas.map((area) => {
            const availableBranches = branches.filter(
              (b) => !assignedBranchIds.has(b.id),
            );

            return (
              <Card key={area.id} className="p-4">
                <h3 className="font-semibold">{area.name}</h3>

                {/* Assigned branches */}
                <div className="mt-3 space-y-1">
                  {area.area_branches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa gán chi nhánh
                    </p>
                  ) : (
                    area.area_branches.map((ab) => (
                      <div
                        key={ab.id}
                        className="flex items-center justify-between"
                      >
                        <Badge variant="secondary">
                          {ab.branches?.name ?? `#${ab.branch_id}`}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveBranch(ab.id)}
                          disabled={isPending}
                          className="size-6 p-0"
                        >
                          <IconX className="size-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add branch */}
                {availableBranches.length > 0 && (
                  <div className="mt-3">
                    <Select
                      value=""
                      onValueChange={(val) => {
                        const branchId = Number(val);
                        if (branchId) handleAssignBranch(area.id, branchId);
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="+ Thêm chi nhánh..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBranches.map((b) => (
                          <SelectItem key={b.id} value={b.id.toString()}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

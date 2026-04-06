"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Card } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Badge } from "@comtammatu/ui/components/badge";
import { Plus, X, MapPin } from "lucide-react";
import {
  createArea,
  assignBranchToArea,
  removeBranchFromArea,
} from "./actions";

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
  initialAreas: Area[];
  branches: { id: number; name: string }[];
}

export function AreasManager({ initialAreas, branches }: AreasManagerProps) {
  const [areas] = useState<Area[]>(initialAreas);
  const [newAreaName, setNewAreaName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCreateArea = () => {
    if (!newAreaName.trim()) return;
    startTransition(async () => {
      const result = await createArea(newAreaName.trim());
      if (result.success) {
        setNewAreaName("");
        router.refresh();
      }
    });
  };

  const handleAssignBranch = (areaId: number, branchId: number) => {
    startTransition(async () => {
      const result = await assignBranchToArea(areaId, branchId);
      if (result.success) {
        router.refresh();
      }
    });
  };

  const handleRemoveBranch = (areaBranchId: number) => {
    startTransition(async () => {
      const result = await removeBranchFromArea(areaBranchId);
      if (result.success) {
        router.refresh();
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
          <Plus className="mr-1 size-4" />
          Tạo khu vực
        </Button>
      </div>

      {/* Area list */}
      {areas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center">
          <MapPin className="size-10 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có khu vực nào. Tạo khu vực để phân nhóm chi nhánh.
          </p>
        </Card>
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
                          <X className="size-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add branch */}
                {availableBranches.length > 0 && (
                  <div className="mt-3">
                    <select
                      className="w-full rounded border bg-background px-2 py-1 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        const branchId = Number(e.target.value);
                        if (branchId) handleAssignBranch(area.id, branchId);
                        e.target.value = "";
                      }}
                      disabled={isPending}
                    >
                      <option value="" disabled>
                        + Thêm chi nhánh...
                      </option>
                      {availableBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
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

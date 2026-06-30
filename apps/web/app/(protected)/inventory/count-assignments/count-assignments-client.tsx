"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: count-assignment manager workflow copy stays inline */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X as IconX } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { MultiSelectCombobox } from "@/components/form";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { setCountAssignments } from "./actions";

export interface BranchOption {
  id: number;
  name: string;
}

export interface LocationOption {
  id: number;
  name: string;
  kind: string | null;
}

export interface EmployeeRow {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

interface Props {
  branches: BranchOption[];
  selectedBranchId: number | null;
  locations: LocationOption[];
  selectedLocationId: number | null;
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  assignmentsByEmployee: Record<string, number[]>;
}

function seedSelections(
  employees: readonly EmployeeRow[],
  assignmentsByEmployee: Record<string, number[]>,
) {
  const seed: Record<string, number[]> = {};
  for (const emp of employees) {
    seed[String(emp.id)] = assignmentsByEmployee[String(emp.id)] ?? [];
  }
  return seed;
}

export function CountAssignmentsClient({
  branches,
  selectedBranchId,
  locations,
  selectedLocationId,
  employees,
  ingredients,
  assignmentsByEmployee,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientOption>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  // Per-employee selected ingredient-id set, seeded from the active
  // assignments returned by the server for the current branch+location.
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(employees, assignmentsByEmployee));

  useEffect(() => {
    setSelectionByEmployee(seedSelections(employees, assignmentsByEmployee));
  }, [employees, assignmentsByEmployee]);

  const updateScope = useCallback(
    (next: { branchId?: number | null; locationId?: number | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.branchId !== undefined) {
        if (next.branchId === null) params.delete("branchId");
        else params.set("branchId", String(next.branchId));
        // Branch change invalidates the chosen location.
        params.delete("locationId");
      }
      if (next.locationId !== undefined) {
        if (next.locationId === null) params.delete("locationId");
        else params.set("locationId", String(next.locationId));
      }
      const query = params.toString();
      router.push(`/inventory/count-assignments${query ? `?${query}` : ""}`);
    },
    [router, searchParams],
  );

  const scopeReady = selectedBranchId !== null && selectedLocationId !== null;

  return (
    <AppPage scroll>
      <AppPageHeader
        eyebrow="Kiểm kê"
        title="Phân công đếm tồn"
        description="Chọn chi nhánh và kho, sau đó giao cho mỗi nhân viên các nguyên liệu họ phụ trách đếm tồn."
      />

      <AppSection title="Phạm vi" contentClassName="gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Chi nhánh</Label>
            <Select
              value={selectedBranchId ? String(selectedBranchId) : ""}
              onValueChange={(v) => updateScope({ branchId: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn chi nhánh..." />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Kho</Label>
            <Select
              value={selectedLocationId ? String(selectedLocationId) : ""}
              onValueChange={(v) => updateScope({ locationId: Number(v) })}
              disabled={selectedBranchId === null || locations.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn kho..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                    {l.kind ? ` · ${l.kind}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </AppSection>

      {!scopeReady && (
        <AppEmptyState
          mode="no-data"
          title="Chọn chi nhánh và kho"
          description="Phân công đếm tồn được lưu theo từng chi nhánh và kho. Chọn cả hai để bắt đầu."
        />
      )}

      {scopeReady && employees.length === 0 && (
        <AppEmptyState
          mode="no-data"
          title="Chi nhánh chưa có nhân viên"
          description="Không có nhân viên đang hoạt động tại chi nhánh này để phân công."
        />
      )}

      {scopeReady &&
        employees.map((emp) => (
          <EmployeeAssignmentCard
            key={emp.id}
            employee={emp}
            branchId={selectedBranchId}
            locationId={selectedLocationId}
            ingredients={ingredients}
            ingredientMap={ingredientMap}
            selectedIds={selectionByEmployee[String(emp.id)] ?? []}
            onSelectionChange={(ids) =>
              setSelectionByEmployee((prev) => ({
                ...prev,
                [String(emp.id)]: ids,
              }))
            }
          />
        ))}
    </AppPage>
  );
}

function EmployeeAssignmentCard({
  employee,
  branchId,
  locationId,
  ingredients,
  ingredientMap,
  selectedIds,
  onSelectionChange,
}: {
  employee: EmployeeRow;
  branchId: number;
  locationId: number;
  ingredients: IngredientOption[];
  ingredientMap: Map<number, IngredientOption>;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function handleAdd(addedIds: string[]) {
    const merged = new Set(selectedIds);
    for (const id of addedIds) merged.add(Number(id));
    onSelectionChange([...merged]);
  }

  function handleRemove(id: number) {
    onSelectionChange(selectedIds.filter((x) => x !== id));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setCountAssignments({
        branchId,
        locationId,
        employeeId: employee.id,
        ingredientIds: selectedIds,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể lưu phân công.");
        return;
      }
      toast.success(
        `Đã lưu phân công cho ${employee.name} (${selectedIds.length} nguyên liệu)`,
      );
      router.refresh();
    });
  }

  return (
    <AppSection
      title={employee.name}
      headerHint={`${selectedIds.length} nguyên liệu phụ trách`}
      action={
        <div className="flex items-center gap-2">
          <MultiSelectCombobox
            options={ingredients.map((ing) => ({
              value: String(ing.id),
              label: ing.name,
              hint: ing.unit,
              alreadySelected: selectedSet.has(ing.id),
            }))}
            onConfirm={handleAdd}
            triggerLabel="Thêm nguyên liệu"
            confirmLabel={(n) =>
              n > 0 ? `Thêm ${n} nguyên liệu` : "Thêm nguyên liệu"
            }
            searchPlaceholder="Tìm theo tên..."
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending && <Spinner className="mr-2" />}
            Lưu
          </Button>
        </div>
      }
    >
      {selectedIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa phân công nguyên liệu nào. Nhấn &quot;Thêm nguyên liệu&quot; để
          giao việc đếm tồn.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => {
            const ing = ingredientMap.get(id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                <span>{ing?.name ?? `#${id}`}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  className="ml-0.5 rounded-md text-muted-foreground hover:text-foreground"
                  aria-label={`Bỏ ${ing?.name ?? "nguyên liệu"}`}
                >
                  <IconX className="size-3.5" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </AppSection>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FileText as IconFileText,
  Pencil as IconPencil,
  Search as IconSearch,
  Trash2 as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { confirm } from "@/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { formatVNClockTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { matchesSearch } from "@lib/search";
import type {
  CountAssignmentEmployee,
  CountAssignmentIngredient,
  CountAssignmentLocation,
  CountAssignmentShift,
} from "@lib/inventory/count-assignment-model";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import { StocktakeNavTabs } from "../_components/stocktake-nav-tabs";
import { setCountAssignments } from "./actions";

type EmployeeRow = CountAssignmentEmployee;
type IngredientOption = CountAssignmentIngredient;
type LocationOption = CountAssignmentLocation;
type ShiftOption = CountAssignmentShift;

interface Props {
  selectedBranchId: number | null;
  selectedLocationId: number | null;
  selectedShiftId: number | null;
  locationOptions: LocationOption[];
  shiftOptions: ShiftOption[];
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  assignmentsByEmployee: Record<string, number[]>;
  initialAssignmentId?: number | null;
}

const ALL_SHIFTS_VALUE = "all";
type ShiftScopeValue = number | typeof ALL_SHIFTS_VALUE | null;

function seedSelections(
  employees: readonly EmployeeRow[],
  assignmentsByEmployee: Record<string, number[]>,
) {
  const seed: Record<string, number[]> = {};
  for (const employee of employees) {
    seed[String(employee.id)] =
      assignmentsByEmployee[String(employee.id)] ?? [];
  }
  return seed;
}

function buildShiftScopeHref({
  branchId,
  locationId,
  shiftId,
  assignmentId,
}: {
  branchId: number | null;
  locationId: number | null;
  shiftId: ShiftScopeValue;
  assignmentId?: number | null;
}) {
  const params = new URLSearchParams();
  if (branchId !== null) params.set("branch", String(branchId));
  if (locationId !== null) params.set("locationId", String(locationId));
  if (shiftId !== null) params.set("shiftId", String(shiftId));
  if (assignmentId != null) params.set("assignmentId", String(assignmentId));
  const query = params.toString();
  return query
    ? `/inventory/count-assignments?${query}`
    : "/inventory/count-assignments";
}

function AssignmentBadges({
  selectedIds,
  ingredientMap,
}: {
  selectedIds: readonly number[];
  ingredientMap: Map<number, IngredientOption>;
}) {
  if (selectedIds.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {INVENTORY_VI.countStationUnassigned}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {selectedIds.slice(0, 4).map((id) => (
        <Badge key={id} variant="secondary">
          {ingredientMap.get(id)?.name ?? UNKNOWN_LABEL_VI}
        </Badge>
      ))}
      {selectedIds.length > 4 ? (
        <Badge variant="outline">+{selectedIds.length - 4}</Badge>
      ) : null}
    </div>
  );
}

export function CountAssignmentsClient({
  selectedBranchId,
  selectedLocationId,
  selectedShiftId,
  locationOptions,
  shiftOptions,
  employees,
  ingredients,
  assignmentsByEmployee,
  initialAssignmentId = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize("responsive");
  const [isPending, startTransition] = useTransition();
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(
    initialAssignmentId,
  );
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [draftIds, setDraftIds] = useState<number[]>(() =>
    initialAssignmentId === null
      ? []
      : (assignmentsByEmployee[String(initialAssignmentId)] ?? []),
  );
  const [selectionFilter, setSelectionFilter] = useState<
    "all" | "selected" | "unselected"
  >("all");
  const [staffStatusFilter, setStaffStatusFilter] = useState<
    "all" | "onDuty" | "assigned" | "unassigned"
  >("all");
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(employees, assignmentsByEmployee));
  const selectionByEmployeeRef = useRef(selectionByEmployee);
  selectionByEmployeeRef.current = selectionByEmployee;
  const activeEmployeeIdRef = useRef(activeEmployeeId);
  activeEmployeeIdRef.current = activeEmployeeId;

  useEffect(() => {
    setSelectionByEmployee(seedSelections(employees, assignmentsByEmployee));
  }, [employees, assignmentsByEmployee]);

  const replaceAssignmentId = useCallback(
    (assignmentId: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (assignmentId == null) next.delete("assignmentId");
      else next.set("assignmentId", String(assignmentId));
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  // Sync active employee from URL only — do not depend on selection drafts.
  useEffect(() => {
    const raw = searchParams.get("assignmentId");
    if (raw == null || raw === "") {
      setActiveEmployeeId(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      setActiveEmployeeId(null);
      replaceAssignmentId(null);
      return;
    }
    const employee = employees.find((row) => row.id === parsed);
    if (!employee) {
      setActiveEmployeeId(null);
      replaceAssignmentId(null);
      return;
    }
    setActiveEmployeeId(employee.id);
  }, [employees, replaceAssignmentId, searchParams]);

  // Load draft when the addressable employee changes (open / deep-link / close).
  useEffect(() => {
    if (activeEmployeeId == null) {
      setDraftIds([]);
      setIngredientSearch("");
      setSelectionFilter("all");
      return;
    }
    setDraftIds(selectionByEmployeeRef.current[String(activeEmployeeId)] ?? []);
    setIngredientSearch("");
    setSelectionFilter("all");
  }, [activeEmployeeId]);

  // Reseed draft when server assignments refresh (location/shift scope) while
  // the addressable editor stays open.
  useEffect(() => {
    const employeeId = activeEmployeeIdRef.current;
    if (employeeId == null) return;
    setDraftIds(assignmentsByEmployee[String(employeeId)] ?? []);
  }, [assignmentsByEmployee]);

  const ingredientMap = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const activeEmployee =
    activeEmployeeId === null
      ? null
      : (employees.find((employee) => employee.id === activeEmployeeId) ??
        null);
  const scopeReady = selectedBranchId !== null && selectedLocationId !== null;
  const showLocationPicker = scopeReady && locationOptions.length > 1;
  const showShiftPicker = scopeReady && shiftOptions.length > 0;
  const shiftSelectValue =
    selectedShiftId === null ? ALL_SHIFTS_VALUE : String(selectedShiftId);
  const assignedEmployeeCount = useMemo(
    () =>
      Object.values(selectionByEmployee).filter((ids) => ids.length > 0).length,
    [selectionByEmployee],
  );
  const onDutyEmployeesCount = useMemo(() => {
    if (selectedShiftId == null) return employees.length;
    return employees.filter((emp) =>
      Boolean(emp.scheduledShiftIds?.includes(selectedShiftId)),
    ).length;
  }, [employees, selectedShiftId]);
  const totalAssignedUniqueItems = useMemo(() => {
    const set = new Set<number>();
    for (const ids of Object.values(selectionByEmployee)) {
      for (const id of ids) set.add(id);
    }
    return set.size;
  }, [selectionByEmployee]);
  const visibleEmployees = useMemo(() => {
    const query = employeeSearch.trim();
    return employees.filter((employee) => {
      const matchSearch =
        !query ||
        matchesSearch([employee.name, employee.positionName ?? ""], query);
      const isAssigned =
        (selectionByEmployee[String(employee.id)] ?? []).length > 0;
      const isOnDuty =
        selectedShiftId !== null &&
        Boolean(employee.scheduledShiftIds?.includes(selectedShiftId));

      let matchStatus = true;
      if (staffStatusFilter === "onDuty") {
        matchStatus = isOnDuty;
      } else if (staffStatusFilter === "assigned") {
        matchStatus = isAssigned;
      } else if (staffStatusFilter === "unassigned") {
        matchStatus = !isAssigned;
      }

      return matchSearch && matchStatus;
    });
  }, [
    employeeSearch,
    employees,
    selectedShiftId,
    selectionByEmployee,
    staffStatusFilter,
  ]);
  const visibleIngredients = useMemo(() => {
    const query = ingredientSearch.trim();
    return ingredients.filter((ingredient) => {
      const matchSearch =
        !query || matchesSearch([ingredient.name, ingredient.unit], query);
      const isSelected = draftIds.includes(ingredient.id);
      const matchFilter =
        selectionFilter === "all" ||
        (selectionFilter === "selected" && isSelected) ||
        (selectionFilter === "unselected" && !isSelected);
      return matchSearch && matchFilter;
    });
  }, [draftIds, ingredientSearch, ingredients, selectionFilter]);

  function openEditor(employee: EmployeeRow) {
    setDraftIds(selectionByEmployee[String(employee.id)] ?? []);
    setIngredientSearch("");
    setSelectionFilter("all");
    setActiveEmployeeId(employee.id);
    replaceAssignmentId(employee.id);
  }

  function closeEditor() {
    if (isPending) return;
    setActiveEmployeeId(null);
    setIngredientSearch("");
    setSelectionFilter("all");
    replaceAssignmentId(null);
  }

  function toggleIngredient(id: number) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function handleSave() {
    if (
      activeEmployee === null ||
      selectedBranchId === null ||
      selectedLocationId === null
    ) {
      return;
    }
    const nextIds = [...draftIds];

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: activeEmployee.id,
        shiftId: selectedShiftId,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((current) => ({
        ...current,
        [String(activeEmployee.id)]: nextIds,
      }));
      toast.success(
        nextIds.length === 0
          ? INVENTORY_VI.countAssignRemoved(activeEmployee.name)
          : INVENTORY_VI.countAssignSaved(activeEmployee.name, nextIds.length),
      );
      setActiveEmployeeId(null);
      replaceAssignmentId(null);
      router.refresh();
    });
  }

  async function handleClear(employee: EmployeeRow) {
    if (
      selectedBranchId === null ||
      selectedLocationId === null ||
      (selectionByEmployee[String(employee.id)] ?? []).length === 0
    ) {
      return;
    }
    const accepted = await confirm({
      title: INVENTORY_VI.countAssignRemoveConfirmTitle,
      description: INVENTORY_VI.countAssignRemoveConfirmDescription(
        employee.name,
      ),
      confirmText: ACTIONS_VI.delete,
      variant: "destructive",
    });
    if (!accepted) return;

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: employee.id,
        shiftId: selectedShiftId,
        ingredientIds: [],
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((current) => ({
        ...current,
        [String(employee.id)]: [],
      }));
      toast.success(INVENTORY_VI.countAssignRemoved(employee.name));
      router.refresh();
    });
  }

  function changeShiftScope(value: string) {
    const parsedShiftId =
      value === ALL_SHIFTS_VALUE ? null : Number.parseInt(value, 10);
    const nextShiftId =
      value === ALL_SHIFTS_VALUE
        ? ALL_SHIFTS_VALUE
        : parsedShiftId !== null && Number.isFinite(parsedShiftId)
          ? parsedShiftId
          : null;
    // Keep addressable editor open across shift filter changes (same employee roster).
    router.replace(
      buildShiftScopeHref({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        shiftId: nextShiftId,
        assignmentId: activeEmployeeId,
      }),
    );
  }

  function changeLocationScope(value: string) {
    const nextLocationId = Number.parseInt(value, 10);
    if (!Number.isFinite(nextLocationId)) return;
    // Keep addressable editor open across location filter changes (same employee roster).
    router.replace(
      buildShiftScopeHref({
        branchId: selectedBranchId,
        locationId: nextLocationId,
        shiftId:
          showShiftPicker && selectedShiftId === null
            ? ALL_SHIFTS_VALUE
            : selectedShiftId,
        assignmentId: activeEmployeeId,
      }),
    );
  }

  function getRowActions(employee: EmployeeRow): RowActionItem[] {
    const hasAssignments =
      (selectionByEmployee[String(employee.id)] ?? []).length > 0;
    return [
      {
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil aria-hidden="true" />,
        disabled: isPending,
        onSelect: () => openEditor(employee),
      },
      {
        key: "clear",
        label: ACTIONS_VI.delete,
        icon: <IconTrash aria-hidden="true" />,
        disabled: isPending || !hasAssignments,
        destructive: true,
        separatorBefore: true,
        onSelect: () => void handleClear(employee),
      },
    ];
  }

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: "employee",
      header: INVENTORY_VI.countAssignTableHeaderStaff,
      className: "min-w-52",
      render: (employee) => {
        const isOnShift =
          selectedShiftId !== null &&
          Boolean(employee.scheduledShiftIds?.includes(selectedShiftId));
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 font-medium">
              <span>{employee.name}</span>
              {isOnShift ? (
                <Badge
                  variant="outline"
                  className="px-1 py-0 text-xs text-primary"
                >
                  {INVENTORY_VI.countStationOnDutyBadge}
                </Badge>
              ) : null}
            </div>
            {employee.positionName ? (
              <span className="text-xs text-muted-foreground">
                {employee.positionName}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "assignments",
      header: INVENTORY_VI.countAssignTableHeaderItems,
      className: "min-w-96",
      render: (employee) => (
        <AssignmentBadges
          selectedIds={selectionByEmployee[String(employee.id)] ?? []}
          ingredientMap={ingredientMap}
        />
      ),
    },
    {
      key: "count",
      header: INVENTORY_VI.countAssignTableHeaderQuantity,
      className: "w-28 text-right",
      render: (employee) => (
        <span className="block font-mono tabular-nums text-right">
          {(selectionByEmployee[String(employee.id)] ?? []).length}
        </span>
      ),
    },
    {
      key: "actions",
      header: INVENTORY_VI.countAssignTableHeaderActions,
      className: "w-12 text-right",
      render: (employee) => (
        <RowActionsMenu items={getRowActions(employee)} triggerSize="icon-sm" />
      ),
    },
  ];

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader
        title={INVENTORY_VI.countAssignTitle}
        actions={
          <Button
            variant="outline"
            size={controlSize === "touch" ? "touch" : "lg"}
            render={
              <Link
                href={
                  selectedBranchId === null
                    ? "/inventory/count-slips"
                    : withControlSurfaceBranchScope(
                        "/inventory/count-slips",
                        String(selectedBranchId) as `${number}`,
                        { prefixes: ["/inventory"] },
                      )
                }
              />
            }
          >
            <IconFileText aria-hidden="true" />
            {INVENTORY_VI.countSlipTitle}
          </Button>
        }
        badge={
          scopeReady
            ? {
                children: `${INVENTORY_VI.countAssignAssignedSummary(
                  assignedEmployeeCount,
                  employees.length,
                )} • ${INVENTORY_VI.countAssignCoverageBadge(
                  totalAssignedUniqueItems,
                  ingredients.length,
                )}`,
              }
            : undefined
        }
      />

      <StocktakeNavTabs currentTab="assignments" branchId={selectedBranchId} />

      {!scopeReady ? (
        <AppListFrame>
          <AppEmptyState
            mode="no-data"
            title={INVENTORY_VI.countAssignNoWarehouseTitle}
            description={INVENTORY_VI.countAssignNoWarehouseDescription}
            symbol="riceGrain"
          />
        </AppListFrame>
      ) : (
        <AppListFrame
          toolbar={
            <div className="flex flex-col gap-2">
              <AppToolbar
                variant="inline"
                search={
                  <InputGroup size={controlSize} className="min-w-0 flex-1">
                    <InputGroupAddon>
                      <IconSearch aria-hidden="true" />
                    </InputGroupAddon>
                    <InputGroupInput
                      type="search"
                      aria-label={INVENTORY_VI.staffSearchPlaceholder}
                      value={employeeSearch}
                      onChange={(event) =>
                        setEmployeeSearch(event.target.value)
                      }
                      placeholder={INVENTORY_VI.staffSearchPlaceholder}
                      inputMode="search"
                    />
                  </InputGroup>
                }
                filters={
                  showLocationPicker || showShiftPicker ? (
                    <>
                      {showLocationPicker ? (
                        <Select
                          value={String(selectedLocationId)}
                          onValueChange={changeLocationScope}
                        >
                          <SelectTrigger
                            id="count-assignment-location"
                            size={controlSize}
                            className={inventoryListFilterSelectClassName}
                            aria-label={INVENTORY_VI.warehouseShort}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {locationOptions.map((location) => (
                              <SelectItem
                                key={location.id}
                                value={String(location.id)}
                              >
                                {location.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {showShiftPicker ? (
                        <Select
                          value={shiftSelectValue}
                          onValueChange={changeShiftScope}
                        >
                          <SelectTrigger
                            id="count-assignment-shift"
                            size={controlSize}
                            className={inventoryListFilterSelectClassName}
                            aria-label={INVENTORY_VI.countAssignShiftLabel}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_SHIFTS_VALUE}>
                              {INVENTORY_VI.countAssignAllShifts}
                            </SelectItem>
                            {shiftOptions.map((shift) => (
                              <SelectItem
                                key={shift.id}
                                value={String(shift.id)}
                              >
                                {shift.name} ·{" "}
                                {formatVNClockTime(shift.startTime)}-
                                {formatVNClockTime(shift.endTime)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </>
                  ) : undefined
                }
              />
              <div className="flex flex-wrap gap-1 px-1 pb-1">
                <Button
                  type="button"
                  variant={staffStatusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => setStaffStatusFilter("all")}
                >
                  {INVENTORY_VI.countTabAllWithCount(employees.length)}
                </Button>
                {selectedShiftId != null ? (
                  <Button
                    type="button"
                    variant={
                      staffStatusFilter === "onDuty" ? "default" : "outline"
                    }
                    size="sm"
                    className="h-8 text-xs font-medium"
                    onClick={() => setStaffStatusFilter("onDuty")}
                  >
                    {INVENTORY_VI.countTabOnDutyWithCount(onDutyEmployeesCount)}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={
                    staffStatusFilter === "assigned" ? "default" : "outline"
                  }
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => setStaffStatusFilter("assigned")}
                >
                  {INVENTORY_VI.countTabAssignedWithCount(
                    assignedEmployeeCount,
                  )}
                </Button>
                <Button
                  type="button"
                  variant={
                    staffStatusFilter === "unassigned" ? "default" : "outline"
                  }
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => setStaffStatusFilter("unassigned")}
                >
                  {INVENTORY_VI.countTabUnassignedWithCount(
                    employees.length - assignedEmployeeCount,
                  )}
                </Button>
              </div>
            </div>
          }
        >
          <DataTable
            columns={columns}
            data={visibleEmployees}
            getRowKey={(employee) => employee.id}
            emptyMode={employeeSearch.trim() ? "no-results" : "no-data"}
            emptyTitle={INVENTORY_VI.countAssignNoEmployeesTitle}
            emptyDescription={INVENTORY_VI.countAssignNoEmployeesDescription}
            renderRowContextMenu={(employee) => (
              <RowActionsContextMenuItems items={getRowActions(employee)} />
            )}
            mobileCardRender={(employee) => {
              const selectedIds =
                selectionByEmployee[String(employee.id)] ?? [];
              return (
                <Item variant="outline" className="items-start">
                  <ItemContent className="min-w-0">
                    <ItemTitle>{employee.name}</ItemTitle>
                    <ItemDescription>
                      {selectedIds.length > 0
                        ? INVENTORY_VI.countAssignItemCount(selectedIds.length)
                        : INVENTORY_VI.countStationUnassigned}
                    </ItemDescription>
                    <AssignmentBadges
                      selectedIds={selectedIds}
                      ingredientMap={ingredientMap}
                    />
                  </ItemContent>
                  <ItemActions>
                    <RowActionsMenu
                      items={getRowActions(employee)}
                      triggerSize={
                        controlSize === "touch" ? "icon-touch" : "icon-lg"
                      }
                      itemSize={controlSize === "touch" ? "touch" : "default"}
                    />
                  </ItemActions>
                </Item>
              );
            }}
          />
        </AppListFrame>
      )}

      <AppDialog
        open={activeEmployee !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={INVENTORY_VI.countStationAssignSheetTitle(
          activeEmployee?.name ?? "",
        )}
        description={INVENTORY_VI.countAssignEditDescription(
          activeEmployee?.name ?? "",
        )}
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-3xl"
        bodyClassName="min-h-0 overflow-hidden flex flex-col gap-3"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeEditor}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </>
        }
      >
        <div className="flex shrink-0 flex-col gap-2">
          {/* Quick Select & Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={selectionFilter === "all" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => setSelectionFilter("all")}
              >
                {INVENTORY_VI.countTabAllWithCount(ingredients.length)}
              </Button>
              <Button
                type="button"
                variant={selectionFilter === "selected" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => setSelectionFilter("selected")}
              >
                {INVENTORY_VI.countTabSelectedWithCount(draftIds.length)}
              </Button>
              <Button
                type="button"
                variant={
                  selectionFilter === "unselected" ? "default" : "outline"
                }
                size="sm"
                className="h-8 text-xs font-medium"
                onClick={() => setSelectionFilter("unselected")}
              >
                {INVENTORY_VI.countTabUnselectedWithCount(
                  ingredients.length - draftIds.length,
                )}
              </Button>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDraftIds(ingredients.map((i) => i.id))}
              >
                {INVENTORY_VI.countTemplateSelectAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDraftIds([])}
              >
                {INVENTORY_VI.countTemplateDeselectAll}
              </Button>
            </div>
          </div>

          <InputGroup>
            <InputGroupAddon>
              <IconSearch aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={INVENTORY_VI.countAssignSearchPlaceholder}
              name="count-assignment-ingredient-search"
              autoComplete="off"
              value={ingredientSearch}
              onChange={(event) => setIngredientSearch(event.target.value)}
              placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
              inputMode="search"
            />
          </InputGroup>
        </div>

        <Frame className="h-96 min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto overscroll-contain p-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {ingredients.length === 0 ? (
                <p className="col-span-full px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoFinishedGoods}
                </p>
              ) : visibleIngredients.length === 0 ? (
                <p className="col-span-full px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoIngredientMatches}
                </p>
              ) : (
                visibleIngredients.map((ingredient) => {
                  const checked = draftIds.includes(ingredient.id);
                  const checkboxId = `count-assignment-${activeEmployee?.id}-${ingredient.id}`;
                  return (
                    <Item
                      key={ingredient.id}
                      render={<Label htmlFor={checkboxId} />}
                      variant="outline"
                      className={cn(
                        "min-w-0 cursor-pointer items-center justify-between gap-2 transition-colors",
                        checked ? "border-primary bg-accent" : "hover:bg-muted",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          onCheckedChange={() =>
                            toggleIngredient(ingredient.id)
                          }
                          disabled={isPending}
                        />
                        <span className="min-w-0 truncate font-medium">
                          {ingredient.name}
                        </span>
                        {ingredient.unit ? (
                          <Badge variant="outline" className="text-xs">
                            {ingredient.unit}
                          </Badge>
                        ) : null}
                      </div>
                      {checked ? (
                        <Badge
                          variant="success"
                          className="shrink-0 text-xs font-medium"
                        >
                          {INVENTORY_VI.countBadgeSelected}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          {INVENTORY_VI.countBadgeUnselected}
                        </Badge>
                      )}
                    </Item>
                  );
                })
              )}
            </div>
          </div>
        </Frame>
      </AppDialog>
    </AppPage>
  );
}

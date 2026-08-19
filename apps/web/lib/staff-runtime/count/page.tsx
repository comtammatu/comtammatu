import type { ReactNode } from "react";
import Link from "next/link";
import { UserCircle as IconUserCircle } from "lucide-react";
import { canSubscribeBranchOpsTopic, type JwtClaims } from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getVNDateString } from "@comtammatu/shared/time";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BranchOpsRefresh } from "@/_components/branch-ops-refresh";
import { AppEmptyState } from "@/components/surface";
import { messages } from "@lib/messages";
import { Button } from "@comtammatu/ui/components/button";
import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { resolveDefaultShiftId } from "../_lib/default-shift";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { CountSlipClient, type CountPlane } from "./count-client";

const copy = messages.employee.count;

export interface CountUnitChoice {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number | null;
}

export interface CountAssignment {
  ingredientId: number;
  ingredientName: string;
  // All active counting units for this ingredient, base first.
  countUnits: CountUnitChoice[];
}

export interface CountLocationGroup {
  locationId: number;
  locationName: string;
  assignments: CountAssignment[];
}

export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export interface CountSlipHeader {
  id: number;
  locationId: number;
  status: CountSlipStatus;
  reviewNote: string | null;
}

interface AssignmentUnitRow {
  unit_id: number;
  is_base: boolean;
  sort_order: number;
  to_base_factor: number | null;
  units: { code: string; name: string | null } | null;
}

interface AssignmentRow {
  employee_id: number;
  ingredient_id: number;
  location_id: number;
  shift_id: number | null;
  ingredients: {
    name: string;
    ingredient_units: AssignmentUnitRow[] | null;
  } | null;
}

interface LocationRow {
  id: number;
  name: string;
}

interface SlipRow {
  id: number;
  location_id: number;
  status: string;
}

interface SlipLineRow {
  ingredient_id: number;
  counted_quantity: number;
  entry_unit_id: number | null;
  note: string | null;
}

function assignmentCellKey(row: {
  location_id: number;
  ingredient_id: number;
}) {
  return `${row.location_id}:${row.ingredient_id}`;
}

async function resolveCurrentCountShiftId(
  supabase: SupabaseClient,
  tenantId: number,
  branchId: number,
  employeeId: number,
  today: string,
): Promise<number | null> {
  const { data: openRecords } = await supabase
    .from("attendance_records")
    .select("shift_id")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .is("check_out", null)
    .not("check_in", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  const openShiftId = openRecords?.[0]?.shift_id ?? null;
  if (openShiftId != null) return openShiftId;

  const { data: activeShifts } = await supabase
    .from("shifts")
    .select("id, start_time, end_time")
    .eq("tenant_id", tenantId)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .eq("is_active", true)
    .order("start_time");
  const { data: todayRecords } = await supabase
    .from("attendance_records")
    .select("shift_id, check_out")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .eq("date", today);
  const completedShiftIds = new Set(
    (todayRecords ?? [])
      .filter((record) => record.check_out)
      .map((record) => record.shift_id),
  );
  return resolveDefaultShiftId(
    activeShifts ?? [],
    undefined,
    completedShiftIds,
  );
}

interface EmployeeCountSurfaceProps {
  searchParams: Promise<{ location?: string }>;
  routeBranchId?: number;
  baseHref?: string;
  profileHref: string;
  plane?: CountPlane;
  shiftId?: number | null;
}

interface EmployeeCountPageContentProps extends EmployeeCountSurfaceProps {
  hideHeaderOnMobile?: boolean;
}

async function buildEmployeeCountSurface({
  searchParams,
  routeBranchId,
  baseHref,
  profileHref,
  plane = "employee",
  shiftId: shiftIdOverride,
}: EmployeeCountSurfaceProps): Promise<{
  branchId: number | null;
  branchName: string | null;
  claims: JwtClaims | null;
  content: ReactNode;
}> {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    return {
      branchId: null,
      branchName: null,
      claims: null,
      content: renderCountUnavailableState({ plane, profileHref }),
    };
  }

  const { supabase, claims, employeeId } = ctx;
  const branchId = routeBranchId ?? ctx.branchId;
  const branchName =
    routeBranchId == null || routeBranchId === ctx.branchId
      ? ctx.branchName
      : await resolveBranchName(supabase, claims.tenant_id, routeBranchId);

  if (!branchId) {
    return {
      branchId: null,
      branchName: null,
      claims,
      content: (
        <CountUnavailableState
          plane={plane}
          title={copy.unavailableTitle}
          description={copy.missingBranchDescription}
          profileHref={profileHref}
        />
      ),
    };
  }

  const countReadClient = createServiceClient();
  const today = getVNDateString();
  const currentShiftId =
    shiftIdOverride !== undefined
      ? shiftIdOverride
      : await resolveCurrentCountShiftId(
          supabase,
          claims.tenant_id,
          branchId,
          employeeId,
          today,
        );
  let assignmentQuery = countReadClient
    .from("inventory_count_assignments")
    .select(
      "employee_id, ingredient_id, location_id, shift_id, ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey ( unit_id, is_base, sort_order, to_base_factor, units!ingredient_units_unit_tenant_fkey ( code, name ) ) )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", employeeId)
    .eq("branch_id", branchId)
    .eq("is_active", true);
  assignmentQuery =
    currentShiftId === null
      ? assignmentQuery.is("shift_id", null)
      : assignmentQuery.or(`shift_id.is.null,shift_id.eq.${currentShiftId}`);
  const { data: assignmentData } = await assignmentQuery;

  const shiftSpecificCells = new Set<string>();
  if (currentShiftId !== null) {
    const { data: shiftSpecificAssignments } = await countReadClient
      .from("inventory_count_assignments")
      .select("location_id, ingredient_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("shift_id", currentShiftId)
      .eq("is_active", true);
    for (const row of shiftSpecificAssignments ?? []) {
      shiftSpecificCells.add(assignmentCellKey(row));
    }
  }

  const assignmentRows = (
    (assignmentData ?? []) as unknown as AssignmentRow[]
  ).filter(
    (row) =>
      row.shift_id !== null || !shiftSpecificCells.has(assignmentCellKey(row)),
  );

  if (assignmentRows.length === 0) {
    return {
      branchId,
      branchName,
      claims,
      content: (
        <CountUnavailableState
          plane={plane}
          title={copy.noAssignmentsTitle}
          description={copy.noAssignmentsDescription}
          profileHref={profileHref}
        />
      ),
    };
  }

  const locationIds = [
    ...new Set(assignmentRows.map((row) => row.location_id)),
  ];

  const { data: locationData } = await countReadClient
    .from("inventory_locations")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .in("id", locationIds);

  const locationNameById = new Map(
    ((locationData ?? []) as LocationRow[]).map((row) => [row.id, row.name]),
  );

  const groups: CountLocationGroup[] = locationIds
    .map((locationId) => ({
      locationId,
      locationName:
        locationNameById.get(locationId) ?? copy.locationFallback(locationId),
      assignments: assignmentRows
        .filter((row) => row.location_id === locationId)
        .map((row) => ({
          ingredientId: row.ingredient_id,
          ingredientName: row.ingredients?.name ?? copy.ingredientFallback,
          // Counting can use any of the ingredient's units (no role filter), base first.
          countUnits: (row.ingredients?.ingredient_units ?? [])
            .filter((u) => (u.units?.code ?? "") !== "")
            .sort((a, b) => {
              if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
              return a.sort_order - b.sort_order;
            })
            .map((u) => ({
              unitId: u.unit_id,
              code: u.units?.code ?? "",
              label: u.units?.name ?? u.units?.code ?? "",
              isBase: u.is_base,
              toBaseFactor:
                u.to_base_factor == null ? null : Number(u.to_base_factor),
            })),
        }))
        .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, "vi")),
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName, "vi"));

  const { location: locationParam } = await searchParams;
  const parsedLocation = Number(locationParam);
  const selectedLocationId =
    groups.find((group) => group.locationId === parsedLocation)?.locationId ??
    (groups.length === 1 ? groups[0]!.locationId : null);

  let slipQuery = supabase
    .from("inventory_count_slips")
    .select("id, location_id, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("employee_id", employeeId)
    .eq("branch_id", branchId)
    .eq("count_date", today);
  slipQuery =
    currentShiftId === null
      ? slipQuery.is("shift_id", null)
      : slipQuery.eq("shift_id", currentShiftId);
  const { data: slipData } = await slipQuery;

  const slipRows = (slipData ?? []) as SlipRow[];
  const slipByLocation = new Map<number, CountSlipHeader>(
    slipRows
      .filter(
        (row): row is SlipRow & { status: CountSlipStatus } =>
          row.status === "submitted" ||
          row.status === "needs_changes" ||
          row.status === "approved",
      )
      .map((row) => [
        row.location_id,
        {
          id: row.id,
          locationId: row.location_id,
          status: row.status,
          reviewNote: null,
        },
      ]),
  );

  // review_note is read separately so the column list stays explicit.
  if (slipRows.length > 0) {
    let reviewQuery = supabase
      .from("inventory_count_slips")
      .select("id, review_note")
      .eq("tenant_id", claims.tenant_id)
      .eq("employee_id", employeeId)
      .eq("branch_id", branchId)
      .eq("count_date", today);
    reviewQuery =
      currentShiftId === null
        ? reviewQuery.is("shift_id", null)
        : reviewQuery.eq("shift_id", currentShiftId);
    const { data: reviewData } = await reviewQuery;
    const reviewById = new Map(
      (
        (reviewData ?? []) as Array<{ id: number; review_note: string | null }>
      ).map((row) => [row.id, row.review_note]),
    );
    for (const header of slipByLocation.values()) {
      header.reviewNote = reviewById.get(header.id) ?? null;
    }
  }

  // Blind prefill: only when the selected location's slip needs changes, fetch
  // the employee's previously counted values via the blind RPC (no system qty).
  let prefill: Record<
    number,
    { quantity: string; entryUnitId: number | null; note: string }
  > = {};
  const selectedSlip =
    selectedLocationId !== null
      ? (slipByLocation.get(selectedLocationId) ?? null)
      : null;
  if (selectedSlip && selectedSlip.status === "needs_changes") {
    const { data: slipLines } = await supabase.rpc("get_my_count_slip", {
      p_slip_id: selectedSlip.id,
    });
    const lineRows = (slipLines ?? []) as SlipLineRow[];
    prefill = Object.fromEntries(
      lineRows.map((line) => [
        line.ingredient_id,
        {
          quantity: String(line.counted_quantity),
          entryUnitId: line.entry_unit_id,
          note: line.note ?? "",
        },
      ]),
    );
  }

  return {
    branchId,
    branchName,
    claims,
    content: (
      <CountSlipClient
        branchId={branchId}
        shiftId={currentShiftId}
        plane={plane}
        baseHref={baseHref ?? `/br/${branchId}/stock/count`}
        groups={groups}
        selectedLocationId={selectedLocationId}
        slipByLocation={Object.fromEntries(slipByLocation)}
        prefill={prefill}
      />
    ),
  };
}

function CountUnavailableState({
  plane,
  title,
  description,
  profileHref,
}: {
  plane: CountPlane;
  title?: string;
  description?: string;
  profileHref: string;
}) {
  if (plane === "employee") {
    return (
      <EmployeeMissingProfileEmpty
        title={title}
        description={description}
        profileHref={profileHref}
      />
    );
  }

  return (
    <BranchOperatorPanel tone="info" size="sm">
      <AppEmptyState
        title={title ?? messages.employee.profile.missingProfileTitle}
        description={
          description ?? messages.employee.profile.missingProfileDescription
        }
        icon={<IconUserCircle />}
      >
        <Button
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
          render={<Link href={profileHref ?? "/br"} />}
        >
          <IconUserCircle data-icon="inline-start" />
          {messages.employee.profile.openProfile}
        </Button>
      </AppEmptyState>
    </BranchOperatorPanel>
  );
}

function renderCountUnavailableState(props: {
  plane: CountPlane;
  title?: string;
  description?: string;
  profileHref: string;
}) {
  return <CountUnavailableState {...props} />;
}

export async function StaffCountPanelContent(props: EmployeeCountSurfaceProps) {
  const { content } = await buildEmployeeCountSurface(props);
  return content;
}

export async function StaffCountPageContent({
  hideHeaderOnMobile,
  ...props
}: EmployeeCountPageContentProps) {
  const { branchId, branchName, claims, content } =
    await buildEmployeeCountSurface(props);
  const PageShell =
    props.plane === "branch" ? BranchOperatorPage : EmployeePage;

  return (
    <PageShell
      title={copy.title}
      description={branchName ?? undefined}
      hideHeaderOnMobile={hideHeaderOnMobile}
    >
      {branchId !== null &&
      props.routeBranchId == null &&
      claims !== null &&
      canSubscribeBranchOpsTopic(claims, branchId) ? (
        <BranchOpsRefresh branchId={branchId} />
      ) : null}
      {content}
    </PageShell>
  );
}

async function resolveBranchName(
  supabase: SupabaseClient,
  tenantId: number,
  branchId: number,
) {
  const { data } = await supabase
    .from("branches")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .maybeSingle();
  return data?.name ?? null;
}

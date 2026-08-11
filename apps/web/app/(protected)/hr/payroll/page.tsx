import Link from "next/link";
import { getVNMonthYear } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { ResponsiveBackButton } from "@/components/responsive-action-button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchPayrollBranches, fetchPayrollPreview } from "../payroll-actions";
import { PayrollListClient } from "./payroll-list-client";
import {
  getHrScopeBranchId,
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

type SearchParams = {
  month?: string;
  branch?: string;
  q?: string;
  salaryStatus?: string;
  standardDays?: string;
  calendar?: string;
  day?: string;
};

function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function resolveCalendarDay(value: string | undefined, month: string) {
  if (!value?.startsWith(`${month}-`)) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? value : null;
}

function parseMonth(value: string | undefined) {
  const fallback = getVNMonthYear();
  const matched = value?.match(/^(\d{4})-(\d{2})$/);
  if (!matched) return fallback;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return fallback;
  }
  return { year, month };
}

function parseStandardDays(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const days = Number(value);
  return Number.isFinite(days) && days > 0 && days <= 31 ? days : undefined;
}

function parseCalendarTarget(value: string | undefined): "all" | number | null {
  if (value === "all") return "all";
  const employeeId = Number(value);
  return Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null;
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { month, year } = parseMonth(params.month);
  const monthKey = monthValue(year, month);
  const standardDays = parseStandardDays(params.standardDays);
  const calendarTarget = parseCalendarTarget(params.calendar);
  const selectedCalendarDay =
    calendarTarget != null
      ? resolveCalendarDay(params.day, monthKey)
      : null;
  const copy = messages.hr.payroll;
  const branchesResult = await fetchPayrollBranches();
  const branches = branchesResult.success ? (branchesResult.data ?? []) : [];
  const branchScope = resolveHrBranchScope(params.branch, branches);
  const branchId = getHrScopeBranchId(branchScope);
  const officeOnly = branchScope === "office";
  const previewResult = await fetchPayrollPreview({
    month,
    year,
    standardDays,
    branchId,
    officeOnly,
  });

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.live.title}
        description={copy.live.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ResponsiveBackButton
              href={withHrBranchScope("/hr", branchScope)}
            >
              {copy.backToHr}
            </ResponsiveBackButton>
          </div>
        }
      />
      {previewResult.success && previewResult.data ? (
        <PayrollListClient
          preview={previewResult.data}
          query={params.q ?? ""}
          selectedBranchId={branchId}
          officeOnly={officeOnly}
          selectedSalaryStatus={params.salaryStatus}
          calendarTarget={calendarTarget}
          selectedCalendarDay={selectedCalendarDay}
        />
      ) : (
        <AppSection
          tone="warning"
          title={copy.live.loadFailedTitle}
          description={copy.live.loadFailedDescription}
        >
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={withHrBranchScope("/hr/payroll", branchScope)} />
            }
          >
            {copy.live.retry}
          </Button>
        </AppSection>
      )}
    </AppPage>
  );
}

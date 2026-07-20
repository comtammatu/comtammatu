import Link from "next/link";
import { getVNMonthYear } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchPayrollBranches, fetchPayrollPreview } from "../payroll-actions";
import { PayrollListClient } from "./payroll-list-client";

type SearchParams = {
  month?: string;
  branch?: string;
  q?: string;
  standardDays?: string;
};

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

function parseBranchId(value: string | undefined): number | null {
  const branchId = Number(value);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { month, year } = parseMonth(params.month);
  const branchId = parseBranchId(params.branch);
  const standardDays = parseStandardDays(params.standardDays);
  const copy = messages.hr.payroll;
  const [previewResult, branchesResult] = await Promise.all([
    fetchPayrollPreview({ month, year, standardDays, branchId }),
    fetchPayrollBranches(),
  ]);

  return (
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.live.title}
        description={copy.live.description}
        actions={
          <Button variant="outline" size="touch" render={<Link href="/hr" />}>
            {copy.backToHr}
          </Button>
        }
      />
      {previewResult.success && previewResult.data ? (
        <PayrollListClient
          preview={previewResult.data}
          branches={branchesResult.success ? (branchesResult.data ?? []) : []}
          query={params.q ?? ""}
          selectedBranchId={branchId}
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
            render={<Link href="/hr/payroll" />}
          >
            {copy.live.retry}
          </Button>
        </AppSection>
      )}
    </AppPage>
  );
}

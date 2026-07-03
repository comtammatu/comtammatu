import { IssuesPageContent } from "../issues/page";

export default async function ConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
}) {
  return (
    <IssuesPageContent
      searchParams={searchParams}
      scope="consumption"
      listBasePath="/inventory/consumption"
    />
  );
}

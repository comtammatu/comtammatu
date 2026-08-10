import { IssuesPageContent } from "../issues/issues-page-content";

export default async function ConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
    view?: string | string[];
  }>;
}) {
  return (
    <IssuesPageContent
      searchParams={searchParams}
      scope="hub"
      listBasePath="/inventory/consumption"
      detailBasePath="/inventory/consumption"
    />
  );
}

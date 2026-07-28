import { IssueDetailPageContent } from "../../issues/issue-detail-page-content";

export default async function ConsumptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <IssueDetailPageContent
      issueId={Number(id)}
      listBasePath="/inventory/consumption"
    />
  );
}

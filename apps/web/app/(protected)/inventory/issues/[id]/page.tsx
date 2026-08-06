import { IssueDetailPageContent } from "../issue-detail-page-content";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <IssueDetailPageContent
      issueId={Number(id)}
      listBasePath="/inventory/issues"
    />
  );
}

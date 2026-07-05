import { notFound } from "next/navigation";
import {
  PERSONAL_LINKS,
  ProfilePageContent,
} from "@lib/employee/profile/page";

export default async function OperatorProfilePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const personalLinks = PERSONAL_LINKS.filter(
    (link) => link.key === "payslip",
  ).map((link) => ({ ...link, href: `/br/${branchId}/profile/payslip` }));

  return (
    <ProfilePageContent
      personalLinks={personalLinks}
      showWorkspaceLinks={false}
    />
  );
}

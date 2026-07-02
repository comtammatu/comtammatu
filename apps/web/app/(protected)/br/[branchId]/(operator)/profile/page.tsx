import { notFound } from "next/navigation";
import {
  PERSONAL_LINKS,
  ProfilePageContent,
} from "@/(protected)/employee/profile/page";

export default async function OperatorProfilePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const personalLinks = PERSONAL_LINKS.map((link) =>
    link.key === "payslip"
      ? { ...link, href: `/br/${branchId}/profile/payslip` }
      : link,
  );

  return <ProfilePageContent personalLinks={personalLinks} />;
}

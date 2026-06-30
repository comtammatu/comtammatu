import { notFound } from "next/navigation";
import {
  PERSONAL_LINKS,
  ProfilePageContent,
} from "@/(protected)/employee/profile/page";

export default async function OperatorShiftProfilePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const personalLinks = PERSONAL_LINKS.map((link) =>
    link.key === "leave"
      ? { ...link, href: `/br/${branchId}/shift/leave` }
      : link.key === "payslip"
        ? { ...link, href: `/br/${branchId}/shift/payslip` }
        : link,
  );

  return <ProfilePageContent personalLinks={personalLinks} />;
}

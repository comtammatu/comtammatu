import { StaffPayslipPageContent } from "@lib/staff-runtime/payslip/page";

export default function SelfServicePayslipPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  return (
    <StaffPayslipPageContent
      searchParams={searchParams}
      profileHref="/me/profile"
    />
  );
}

import { PayslipPageContent } from "@/(protected)/employee/payslip/page";

export default function OperatorShiftPayslipPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  return (
    <PayslipPageContent
      searchParams={searchParams}
      hideHeaderOnMobile
    />
  );
}

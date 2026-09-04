import { loadAuthState } from "@/_lib/auth";
import { AppPage } from "@/components/surface";
import { loadCheckoutReviewQueue } from "@lib/staff-runtime/checkout-approvals/data";
import { CheckoutApprovalsListClient } from "./checkout-approvals-list-client";

export default async function CheckoutApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ attendanceId?: string }>;
}) {
  const { supabase, claims } = await loadAuthState();
  const { attendanceId } = await searchParams;
  const parsedAttendanceId = Number(attendanceId);
  const focusAttendanceId =
    Number.isInteger(parsedAttendanceId) && parsedAttendanceId > 0
      ? parsedAttendanceId
      : undefined;

  const { items, canApprove } = await loadCheckoutReviewQueue(
    supabase,
    claims,
    null,
  );

  return (
    <AppPage width="xwide">
      <CheckoutApprovalsListClient
        items={items}
        canApprove={canApprove}
        focusAttendanceId={focusAttendanceId}
      />
    </AppPage>
  );
}

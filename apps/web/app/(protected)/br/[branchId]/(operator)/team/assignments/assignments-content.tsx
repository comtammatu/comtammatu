/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
import { Suspense } from "react";
import { AppSection } from "@/components/surface";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ChecklistAssignment } from "./checklist-assignment";
import { CountAssignmentsPageContent } from "@/(protected)/inventory/count-assignments/page";

export function TeamAssignmentsContent({
  branchId,
}: {
  branchId: number;
}) {
  return (
    <div className="flex flex-col gap-6 w-full">
      <AppSection
        title="Việc trong ca (Checklist)"
        description="Gán mẫu Việc trong ca cho từng nhân viên tại chi nhánh. Các mẫu này được định nghĩa ở mục Hành chính - Nhân sự."
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          }
        >
          <ChecklistAssignment branchId={branchId} />
        </Suspense>
      </AppSection>

      <AppSection
        title="Phân công Kiểm kê (Duyệt tồn)"
        description="Chọn các nguyên liệu để giao việc đếm tồn kho cho nhân viên vào cuối ngày."
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          }
        >
          <CountAssignmentsPageContent
            routeBranchId={branchId}
            embedded={true}
          />
        </Suspense>
      </AppSection>
    </div>
  );
}

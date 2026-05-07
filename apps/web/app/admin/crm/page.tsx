import { Heart as IconHeart } from "lucide-react";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

import { CUSTOMER_VI } from "@comtammatu/shared/messages";
export default function CrmPage() {
  return (
    <AppPage>
      <AppPageHeader title={CUSTOMER_VI.long} eyebrow={CUSTOMER_VI.long} />
      <AppEmptyState
        title="Chưa có dữ liệu khách hàng"
        description="Mục này sẽ dùng khi cửa hàng bắt đầu quản lý khách quen và lịch sử mua hàng."
        icon={<IconHeart />}
      />
    </AppPage>
  );
}

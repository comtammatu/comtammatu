import { Heart as IconHeart } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { EmptyStatePanel } from "@/admin/components/empty-state-panel";

import { CUSTOMER_VI } from "@comtammatu/shared/messages";
export default function CrmPage() {
  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero eyebrow={CUSTOMER_VI.long} title={CUSTOMER_VI.long} />
      <EmptyStatePanel
        title="Chưa có dữ liệu khách hàng"
        description="Mục này sẽ dùng khi cửa hàng bắt đầu quản lý khách quen và lịch sử mua hàng."
        icon={<IconHeart />}
      />
    </div>
  );
}

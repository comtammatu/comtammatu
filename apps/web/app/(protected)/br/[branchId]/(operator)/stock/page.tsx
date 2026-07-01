import {
  ChartBar,
  ClipboardCheck,
  ClipboardList,
  ClipboardMinus,
  Package,
  PackageX,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { messages } from "@lib/messages";

export default async function OperatorStockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const copy = messages.inventory;

  return (
    <EmployeePage title={MODULE_ACL.inventory.label}>
      <EmployeeActionSection
        links={[
          {
            key: "on-hand",
            href: `/br/${branchId}/stock/on-hand`,
            title: copy.stock.title,
            icon: Warehouse,
          },
          {
            key: "issues",
            href: `/br/${branchId}/stock/issues`,
            title: "Xuất dùng / tiêu hao",
            icon: ClipboardMinus,
          },
          {
            key: "purchase-orders",
            href: `/br/${branchId}/stock/purchase-orders`,
            title: copy.po.list,
            icon: ShoppingCart,
          },
          {
            key: "reports",
            href: `/br/${branchId}/stock/reports`,
            title: copy.reports.pageTitle,
            icon: ChartBar,
          },
          {
            key: "count",
            href: `/br/${branchId}/stock/count`,
            title: copy.dashboard.stocktakeProgress,
            icon: ClipboardList,
          },
          {
            key: "count-slips",
            href: `/br/${branchId}/stock/count-slips`,
            title: "Duyệt phiếu đếm tồn",
            icon: ClipboardCheck,
          },
          {
            key: "receive",
            href: `/br/${branchId}/stock/receive`,
            title: copy.grn.documentLabel,
            icon: Package,
          },
          {
            key: "transfer",
            href: `/br/${branchId}/stock/transfer`,
            title: copy.dashboard.transferTrackingTitle,
            icon: Truck,
          },
          {
            key: "waste",
            href: `/br/${branchId}/stock/waste`,
            title: copy.stock.actions.waste,
            icon: PackageX,
          },
        ]}
        columns={1}
      />
    </EmployeePage>
  );
}

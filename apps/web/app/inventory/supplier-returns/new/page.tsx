import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";

export default function NewSupplierReturnPage() {
  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title="Tạo phiếu trả hàng NCC"
        description="Tạo phiếu trả hàng mới cho nhà cung cấp."
      />
      <AppEmptyState
        mode="no-data"
        title="Tính năng đang phát triển"
        description="Tạo phiếu trả hàng từ phiếu nhập được thực hiện trực tiếp trong màn hình chi tiết phiếu nhập."
      />
    </AppPage>
  );
}

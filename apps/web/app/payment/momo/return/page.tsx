import Link from "next/link";

export default function MomoReturnPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-normal">
            Thanh toán MoMo đã xử lý
          </h1>
          <p className="text-sm text-muted-foreground">
            Hệ thống sẽ tự cập nhật hóa đơn tại quầy sau khi nhận xác nhận từ
            MoMo.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center border px-4 text-sm font-medium"
        >
          Về hệ thống
        </Link>
      </section>
    </main>
  );
}

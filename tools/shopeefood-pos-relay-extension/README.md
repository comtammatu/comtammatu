# ShopeeFood POS Relay — Chrome Extension

Extension tự động bắt đơn hàng từ cổng đối tác Shopee Partner (`https://partner.shopee.vn/order/report-restaurant`, `https://partner.shopeefood.vn`, `https://merchant.shopeefood.vn`) và đẩy thẳng vào KDS Bếp & Máy in Cơm Tấm Má Tư.

## Tính năng chính

1. **Tự động bắt đơn Realtime**:
   - Tự động bắt đơn hàng mới ngay khi Shopee Partner nhận đơn.
   - Bóc tách đầy đủ danh sách món, số lượng, tùy chọn topping, ghi chú và yêu cầu dụng cụ ăn uống (muỗng đũa).
   - Đẩy về Webhook POS `/api/webhooks/shopeefood/relay` để tạo đơn `delivery`, tự động in phiếu chế biến bếp và hiện lên màn hình KDS.
2. **Đồng bộ trạng thái hết món 2 chiều**:
   - Định kỳ poll từ POS để tự động cập nhật trạng thái hết món / mở bán lại trên ShopeeFood khi bếp báo hết món.
3. **Idempotency & Replay Protection**:
   - Chống bắt trùng đơn bằng cách lưu vết `orderId` và `external_order_ref`.

## Cài đặt trên Google Chrome / Microsoft Edge

1. Mở Chrome/Edge, truy cập: `chrome://extensions/`
2. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục `tools/shopeefood-pos-relay-extension`.
5. Bấm vào icon extension trên thanh công cụ:
   - **Địa chỉ máy chủ POS**: Điền URL của POS (ví dụ `http://localhost:3000` hoặc domain Production).
   - **Chi nhánh (Branch ID)**: Điền ID chi nhánh của quán (mặc định: `1`).
   - Bấm **Lưu Cài Đặt** và **Test Kết Nối**.
6. Mở tab Shopee Partner: `https://partner.shopee.vn/order/report-restaurant`.
   - Bạn sẽ thấy huy hiệu tròn `🟢 ShopeeFood POS Relay: Đang trực đơn...` ở góc dưới bên phải màn hình.
   - Khi có đơn mới, extension sẽ tự động chuyển đơn sang KDS và máy in trong vòng 1 giây.

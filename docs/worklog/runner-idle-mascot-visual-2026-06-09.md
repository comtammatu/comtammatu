# Runner Idle Mascot Visual V1

## T2 Self-Review

PM: scope = nâng idle state của Runner khi không có dòng đơn; acceptance = Empty/Done có mascot động, brand nhẹ, và board hiện tại vẫn thắng khi có đơn; priority = medium-high vì màn Runner thường bật liên tục tại quầy.
BA: rules = Empty khi hôm nay chưa có `kds_tickets`, Done khi hôm nay đã có ticket nhưng không còn live rows; no QR/promo/display mode; data flow chỉ đọc count hôm nay.
Dev: approach = giữ Runner server page, thêm client `RunnerIdleVisual` dùng `@lottiefiles/dotlottie-react` và local asset; no DB migration/RPC/action; risk = animation/runtime bundle và copy drift.
QA: tests = update static Runner test, run web runner test plus repo typecheck/lint/build; smoke reduced-motion and live-ticket takeover when possible.

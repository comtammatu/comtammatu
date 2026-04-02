# Session Start Prompt

Dán prompt này vào đầu mỗi session Claude Code:

---

```
Bắt đầu session mới. Trước khi làm bất cứ gì, thực hiện đúng Session Protocol:

1. Đọc các file bắt buộc (dùng Read tool, KHÔNG skip):
   - docs/plan/roadmap.md → tìm session tiếp theo
   - tasks/regressions.md → ghi nhớ các lỗi KHÔNG được lặp lại
   - tasks/lessons.md → ghi nhớ các bài học
   - tasks/todo.md → trạng thái hiện tại

2. Output checklist SAU KHI ĐỌC (bắt buộc):
   ```
   SESSION START CHECKLIST
   ─────────────────────────
   □ Roadmap: next session = [tên session]
   □ Regressions: [liệt kê TẤT CẢ rule names]
   □ Lessons: [số bài học] items loaded
   □ Git: [clean/dirty]
   □ Task Contract: [viết nếu ≥3 steps]
   ```

3. Viết Task Contract (nếu task ≥3 bước) TRƯỚC khi code.

4. Trong quá trình code:
   - SQL/migration → `/db-migrate` trước
   - Server Action → `/new-action` trước
   - New page → `/new-page` trước

5. Trước khi commit, PHẢI chạy:
   pnpm typecheck && pnpm lint && pnpm build
   (cả 3, không được skip lint)

6. Sau khi verify pass → `/review` → fix nếu có → commit → update roadmap + todo

Bắt đầu với bước 1. Đọc files ngay.
```

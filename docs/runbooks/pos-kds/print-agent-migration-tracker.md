# Print Agent Migration Tracker (.exe → Node)

Track migration của từng chi nhánh từ legacy .exe sang Node path. Update inline
khi hoàn tất 1 chi nhánh — commit/PR sau mỗi batch để team có visibility.

## Trạng thái fleet (snapshot từ DB)

Run SQL này trong Supabase SQL editor để xem live status:

```sql
SELECT branch_id, branch_name, version, transport, status,
       last_seen_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS last_seen_vn,
       seconds_since_seen
FROM public.v_print_agent_fleet
ORDER BY 
  CASE status
    WHEN 'never_started' THEN 1
    WHEN 'offline' THEN 2
    WHEN 'legacy_or_offline' THEN 3
    WHEN 'active_unknown_version' THEN 4
    WHEN 'migrated_node' THEN 5
  END,
  branch_name;
```

Filter chỉ chi nhánh cần migrate:

```sql
SELECT * FROM public.v_print_agent_fleet
WHERE status IN ('legacy_or_offline', 'active_unknown_version');
```

## Migration plan per branch

Track từng chi nhánh ở bảng dưới. Cập nhật cell khi chuyển sang trạng thái mới.

### Status legend

- ⏳ **pending**: chưa bắt đầu
- 🔄 **in-progress**: maintenance window đã book hoặc đang migrate
- ✅ **done**: migrated thành công + smoke test pass
- ⚠️ **rollback**: phải rollback về .exe (note rõ lý do)
- 🚫 **blocked**: chặn bởi yếu tố khác (Node không cài được, IT cấm, v.v.)

### Tracker

| # | Branch ID | Branch Name | Pre-check date | OS / Node ver | Window booked | Migrated date | By | Smoke test | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 |   |   |   |   |   |   |   |   | ⏳ |   |
| 2 |   |   |   |   |   |   |   |   | ⏳ |   |
| 3 |   |   |   |   |   |   |   |   | ⏳ |   |
| 4 |   |   |   |   |   |   |   |   | ⏳ |   |
| 5 |   |   |   |   |   |   |   |   | ⏳ |   |

> Thêm row khi cần. Branch ID xem ở `/admin/settings/branches` hoặc query
> `SELECT id, name FROM branches WHERE is_active`.

### Smoke test checklist (mỗi chi nhánh)

Sau migration, test 3 scenario thực tế (in giấy thật, kiểm thị giác):

1. **Receipt + payment**:
   - [ ] Confirm payment cash 100k cho 1 đơn → in receipt
   - [ ] Check label "Tiền mặt" hiện đúng (KHÔNG raw "cash")
   - [ ] Tiền nhận / Tiền trả khách dòng đúng
   - [ ] In lại 1 lần → physical print ra (B9 idempotency working)

2. **Cancel ticket có note**:
   - [ ] Tạo order với 1 món có note "ít muối"
   - [ ] Gửi bếp → in phiếu bếp đúng
   - [ ] Huỷ món đó với lý do "khách đổi ý" → in phiếu hủy
   - [ ] Phiếu hủy có dòng `* ít muối` strikethrough (B6 working)

3. **Shift close**:
   - [ ] Chốt ca cuối ngày
   - [ ] Phiếu chốt ca có dòng "Thu ngân: <tên>" (KHÔNG "Người order:") (B2 working)

### Rollback

Nếu smoke test fail hoặc gặp vấn đề runtime nghiêm trọng:

```powershell
# Stop service Node
Stop-Service ComTamMaTu-PrintAgent

# Restore .exe + .env từ backup (path do migrate-from-exe.ps1 tự log)
$backup = "C:\ProgramData\ComTamMaTu\print-agent\backup-exe-<timestamp>"
Copy-Item "$backup\*.exe" C:\path\to\old\dist-bin\ -Force
Copy-Item "$backup\.env" C:\path\to\old\dist-bin\ -Force

# Re-register service trỏ về .exe (backup ở $backup\nssm-config.json)
nssm install ComTamMaTu-PrintAgent C:\path\to\old\dist-bin\comtammatu-print-agent.exe
# Set các params còn lại theo nssm-config.json
nssm set ComTamMaTu-PrintAgent AppDirectory C:\path\to\old\dist-bin

Start-Service ComTamMaTu-PrintAgent
```

Note: rollback service-level only — KHÔNG revert removal của pkg config trong
repo (phía code đã chuyển Node-only deliberately).

## Acceptance (fleet-wide)

- [ ] 100% rows trong `v_print_agent_fleet` có status = `migrated_node`
- [ ] 0 reports về missing prints / wrong labels / cancel ticket bị reject
      (Zod schema mới với `note?` field — agent cũ KHÔNG reject vì optional,
      nhưng vẫn không render được note)
- [ ] Backup .exe files retained 30 ngày (xem `C:\ProgramData\ComTamMaTu\
      print-agent\backup-exe-*`), sau đó archive/delete
- [ ] Update spawn task chip "Migrate legacy .exe branches to Node path" → done

## Timeline

- **Week 1**: pilot 1 chi nhánh (Q1 2026), 24h soak
- **Week 2**: rollout 50% fleet
- **Week 3**: rollout 100% fleet
- **Week 4**: archive backup .exe + dismiss tracker

Beyond Week 4: codebase tiếp tục diverge khỏi .exe legacy, tăng risk customer-
facing bugs (vd thiếu cancel-item note cho khách dị ứng — xem regression
NO-CLAMP-ON-KITCHEN-NOTES).

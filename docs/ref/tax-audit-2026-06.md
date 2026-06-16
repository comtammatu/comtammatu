# Báo cáo kiểm tra & bổ sung kiến thức Thuế — 2026-06

> Phạm vi: HKD Cơm Tấm Má Tư. Đối chiếu toàn bộ doc thuế/lương/HĐĐT trong
> `docs/ref/` + skill `tax-vn` với văn bản pháp luật hiện hành (kiểm chứng web
> tháng 06/2026). Nguồn đầy đủ ở §6.
>
> Nguyên tắc xử lý (theo `AGENTS.md` + `tax-vn/SKILL.md`): mọi xung đột
> **doc/code ↔ luật** chạm tiền là **T3** — báo cáo này chỉ **FLAG**, không tự
> sửa code payroll. Sửa số trong `legal-versions.ts` phải qua T3 (PM/BA/Dev/QA)
> + migration + test khoá, do owner/kế toán xác nhận hiệu lực trước.

## 0. Kết luận nhanh

Kho kiến thức thuế của dự án **phần lớn ĐÚNG và cập nhật** — 13/15 nhóm văn bản
kiểm chứng được đều khớp luật. Tồn tại:

- **2 lỗi NGHIÊM TRỌNG** ảnh hưởng trực tiếp code tính lương → cần kế toán xác
  nhận + T3 (§2.1, §2.2).
- **1 mâu thuẫn nội bộ doc** trong `payroll-pit.md` §5 (§2.3).
- **2 mục từng nghi ngờ nhưng kiểm chứng lại ĐÚNG** — giữ nguyên, chỉ làm rõ (§2.4).
- **4 mảng kiến thức còn thiếu** đã bổ sung vào docs (§3).

## 1. Các mục đã kiểm chứng ĐÚNG (giữ nguyên)

| Văn bản / con số | Nội dung kiểm chứng | Kết luận |
| --- | --- | --- |
| NQ 198/2025/QH15 | Bỏ thuế khoán + miễn lệ phí môn bài HKD từ 01/01/2026 | ✅ Đúng |
| NĐ 70/2025/NĐ-CP | HĐĐT máy tính tiền, HKD doanh thu > 1 tỷ/năm bắt buộc, từ 01/06/2025 | ✅ Đúng |
| NĐ 68/2026/NĐ-CP (05/03/2026) | Phân nhóm HKD theo doanh thu; phương pháp TNCN theo nhóm | ✅ Đúng |
| NĐ 141/2026/NĐ-CP | Nâng ngưỡng không chịu GTGT/TNCN 500tr → **1 tỷ/năm**, hồi tố 01/01/2026, hoàn thuế nộp thừa | ✅ Đúng |
| GTGT 3% / TNCN 1,5% | Tỷ lệ % trên doanh thu cho dịch vụ ăn uống | ✅ Đúng |
| NQ 204/2025 + NĐ 174/2025 | Giảm 2% GTGT 01/07/2025–31/12/2026; phương pháp trực tiếp giảm 20% tỷ lệ % (ăn uống 3% → 2,4%) | ✅ Đúng |
| Biểu TNCN 5 bậc | 5/10/20/30/35% tại các mốc 10/30/60/100tr | ✅ Đúng (lưu ý hiệu lực — §2.1) |
| Giảm trừ gia cảnh | 15,5tr bản thân / 6,2tr người phụ thuộc | ✅ Đúng |
| NĐ 293/2025/NĐ-CP | Lương tối thiểu vùng 2026: Vùng I 5.310.000 / Vùng II 4.730.000 | ✅ Đúng |
| Trần BHXH 46,8tr | 20 × lương cơ sở 2,34tr (NĐ 73/2024) | ✅ Đúng **đến 30/06/2026** (đổi từ 01/07 — §2.2) |
| Luật BHXH 2024 + NĐ 158/2025 | Chủ hộ HKD kê khai: BHXH bắt buộc từ 01/07/2025 | ✅ Đúng |
| TT 152/2025/TT-BTC | Kế toán HKD, thay TT 88/2021 từ 01/01/2026 | ✅ Đúng |
| TNCN 17% nhóm > 3 tỷ | (Doanh thu − Chi phí) × 17% | ✅ Đúng (vd 4 tỷ − 3 tỷ = 1 tỷ × 17% = 170tr) |

## 2. Lỗi & xung đột cần xử lý

### 2.1 [NGHIÊM TRỌNG] Hiệu lực biểu TNCN 5 bậc: từ 01/01/2026, không phải 01/07/2026

**Hiện trạng (doc + code đang giả định):** nửa đầu 2026 (T1–T6) dùng biểu **7
bậc cũ**, từ 01/07/2026 mới chuyển 5 bậc.
- `packages/shared/src/payroll/legal-versions.ts:115-122` — version `effectiveFrom: "2026-01-01"` dùng `pitBrackets: PIT_BRACKETS_2007` (7 bậc).
- `legal-versions.ts:125-132` — chỉ từ `effectiveFrom: "2026-07-01"` mới dùng `PIT_BRACKETS_2026` (5 bậc).
- Doc nêu giả định này ở `legal-framework-2026.md` (mục "Đồng bộ với mã nguồn") và `payroll-pit.md` §2.

**Phát hiện (căn cứ luật):** Luật Thuế TNCN 109/2025/QH15 có **hiệu lực thi hành
chung từ 01/07/2026**, NHƯNG các quy định về **thu nhập từ tiền lương, tiền công
và từ kinh doanh của cá nhân cư trú áp dụng từ kỳ tính thuế năm 2026** (tức
**01/01/2026**). Như vậy biểu 5 bậc + giảm trừ 15,5tr/6,2tr áp dụng cho **toàn bộ
kỳ tính thuế 2026**; doanh nghiệp/NSDLĐ tạm khấu trừ hàng tháng theo mức mới ngay
từ T1/2026, quyết toán Q1/2027. (Nguồn: thuvienphapluat — bài "Biểu thuế lũy tiến
5 bậc áp dụng từ 01/01/2026 hay 01/7/2026".)

**Ảnh hưởng:** code đang áp **đúng giảm trừ mới (15,5tr/6,2tr) từ 01/01/2026
nhưng vẫn dùng biểu 7 bậc cũ cho T1–T6/2026**. Với nhân viên thu nhập thấp
(waiter/cashier/chef, bậc 5%) chênh lệch ~0. Với quản lý thu nhập tính thuế ở
vùng 10–52tr, biểu 7 bậc (10%/15%/20%/25%) cho số thuế **cao hơn** biểu 5 bậc
(10%/20%) → khấu trừ T1–T6/2026 có thể bị tính dư, phải điều chỉnh khi quyết toán.

**Khuyến nghị (T3):** kế toán xác nhận hướng dẫn khấu trừ chuyển tiếp H1/2026 của
CQT. Nếu chốt "5 bậc cho cả kỳ 2026": sửa `legal-versions.ts:115-122` cho version
`2026-01-01` trỏ `pitBrackets: PIT_BRACKETS_2026`, thêm test khoá, cập nhật
`tasks/regressions.md`. **Chưa sửa cho tới khi có xác nhận** — đây là rủi ro
"doc+code khớp nhau nhưng cùng lệch luật", không phải doc↔code mâu thuẫn.

### 2.2 [NGHIÊM TRỌNG] Trần BHXH: 46,8tr → 50,6tr từ 01/07/2026 (NĐ 161/2026 — đang THIẾU)

**Hiện trạng:** doc + code hardcode trần BHXH **46,8tr cho cả năm 2026**.
- `legal-versions.ts:110, 120, 130` — mọi version (kể cả `2026-07-01`) đều `insuranceCap: 46_800_000`.
- `legal-versions.ts:117` comment: *"BHXH cap giữ 46.8M cho đến NĐ mới"* — "NĐ mới" nay đã có.
- `payroll-pit.md` §5 + §4.3 dùng `46_800_000`.

**Phát hiện:** **NĐ 161/2026/NĐ-CP (15/05/2026)** nâng **lương cơ sở 2,34tr →
2,53tr từ 01/07/2026**. Trần BHXH = 20× lương cơ sở → **50,6tr/tháng** từ
01/07/2026. Văn bản NĐ 161/2026 hiện **không có** trong `legal-framework-2026.md`.

**Ảnh hưởng:** từ kỳ lương T7/2026, nhân viên có mức đóng BH > 46,8tr bị tính
trần sai (thấp hơn thực tế) → sai BHXH/BHYT/BHTN cả phần NLĐ và NSDLĐ. Cũng ảnh
hưởng mức BHXH tối thiểu của chủ hộ (tính trên lương cơ sở mới).

**Khuyến nghị (T3):** thêm version `effectiveFrom: "2026-07-01"` thứ hai (hoặc
sửa version hiện có) với `insuranceCap: 50_600_000`; lưu ý phối hợp với mốc đổi
biểu thuế ở §2.1 vì cùng mốc 01/07/2026. Đã thêm NĐ 161/2026 vào sổ pháp lý (§3.1).

### 2.3 [VỪA] `payroll-pit.md` §5 còn code mẫu 7 bậc cũ + default 11tr/4,4tr

`payroll-pit.md` §5 nhúng hàm mẫu `calculatePIT` với **biểu 7 bậc cũ** (mốc
5/10/18/32/52/80tr) và §4.2 để `personal_deduction ... DEFAULT 11000000`,
`dependent_deduction 4.400.000 × count` — **mâu thuẫn với chính §2 (5 bậc) và §3
(15,5tr/6,2tr)** của doc, và không phải engine thật (engine thật version-aware ở
`legal-versions.ts`). Đây là di sản tài liệu gây hiểu nhầm. → Đã chú thích cảnh
báo trong doc (xem §3 báo cáo). DEFAULT 11tr ở cột DB là fallback hợp lệ về kỹ
thuật (engine luôn ghi đè giá trị versioned), nhưng nên ghi rõ là "legacy ≤ 2025".

### 2.4 Hai mục từng nghi ngờ — kiểm chứng lại ĐÚNG (không sửa)

- **TNCN 17% nhóm > 3 tỷ:** ĐÚNG. NĐ 68/2026 áp (Doanh thu − Chi phí) × 17% cho
  HKD doanh thu > 3 tỷ (và 3–50 tỷ). Giữ nguyên.
- **BHXH chủ hộ ≈ 29,5%:** ĐÚNG khi hiểu là **tổng** = BHXH 25% (3% ốm đau-thai
  sản + 22% hưu trí-tử tuất) **+ BHYT 4,5%**. Doc chỉ cần tách rõ thành phần (đã
  làm — §3 báo cáo).

## 3. Bổ sung kiến thức còn thiếu (đã thêm vào docs)

### 3.1 NĐ 161/2026/NĐ-CP — lương cơ sở 2,53tr / trần BHXH 50,6tr (từ 01/07/2026)
Thêm vào `legal-framework-2026.md` §6 và header `payroll-pit.md`.

### 3.2 Chi phí được trừ / không được trừ (NĐ 68/2026) — cho nhóm tính theo (doanh thu − chi phí)
- **Được trừ:** nguyên liệu; lương công có đóng BHXH bắt buộc; khấu hao TSCĐ; lãi
  vay; dịch vụ mua ngoài **có hóa đơn/chứng từ, thanh toán không tiền mặt nếu ≥ 5tr**.
- **Không được trừ:** chi không liên quan SXKD; chi không chứng từ; **lương chủ
  hộ**; tiền phạt vi phạm; chi tiêu cá nhân/gia đình.
- Quan trọng cho Má Tư nếu doanh thu chạm > 3 tỷ/năm → chứng từ đầu vào
  (`supplier_invoices`, 3-way matching) trở thành dữ liệu thuế trực tiếp.
Thêm vào `einvoice-tax.md` §4.

### 3.3 Chế tài / xử phạt (đã thêm `einvoice-tax.md`)
- Không lập HĐĐT khi bán hàng / không dùng HĐĐT máy tính tiền theo NĐ 70/2025:
  xử phạt vi phạm về hóa đơn (NĐ 125/2020 và sửa đổi) — kế toán tra mức cụ thể
  theo hành vi.
- Chậm nộp tiền thuế: tiền chậm nộp **0,03%/ngày** trên số thuế chậm nộp.
- Chậm nộp tờ khai: phạt theo số ngày chậm.
> Mức phạt cụ thể do kế toán chốt theo văn bản xử phạt hiện hành; doc chỉ nêu loại
> nghĩa vụ để hệ thống cảnh báo, không tự áp mức.

### 3.4 Chữ ký số trên HĐĐT máy tính tiền (đã làm rõ `einvoice-tax.md` §3.2)
HĐĐT **khởi tạo từ máy tính tiền (mẫu `2/...`)** theo NĐ 70/2025 **không bắt buộc
chữ ký số người bán**. Doc §3.2 trước đây liệt kê "chữ ký số" như trường bắt buộc
chung — đã chú thích ngoại lệ cho mẫu MTT.

## 4. Checklist hành động (T3) — trạng thái

Đã chạy quy trình T3 (debate 4 góc nhìn: `docs/worklog/tax-pit-bhxh-legal-versions-2026-06-16.md`),
sửa code + test, gate xanh (typecheck + eslint + 15/15 test payroll), verify đối kháng (1 subagent).

- [x] **Biểu TNCN 5 bậc áp cho cả năm 2026** (§2.1) — `legal-versions.ts` version
      `2026-01-01` đã trỏ `PIT_BRACKETS_2026`. ⚠️ **Còn 1 quyết định của kế toán**:
      khấu trừ tháng H1/2026 dùng biểu 5 bậc mới (đã cài) hay tạm giữ 7 bậc cũ rồi
      quyết toán bù — nghĩa vụ năm như nhau; nếu chọn cách cũ, trỏ lại
      `PIT_BRACKETS_2007` (1 dòng).
- [x] **Trần BHXH 50,6tr từ 01/07/2026** (§2.2) — version `2026-07-01` đã đặt
      `insuranceCap: 50_600_000` + test khoá + regression rule.
- [ ] Rà nhân viên có mức đóng BH > 46,8tr (nếu có) để biết mức ảnh hưởng §2.2 —
      **việc của chủ/kế toán** (query dữ liệu thật).
- [ ] Xác nhận có nhân viên nào thu nhập tính thuế > 10tr/tháng trong H1/2026 để
      lượng hóa chênh lệch khấu trừ §2.1 — **việc của chủ/kế toán**.
- [x] Dọn code mẫu 7 bậc cũ trong `payroll-pit.md` §5 — đã thay bằng pointer tới
      engine thật.
- [ ] Theo dõi trước Q4/2026: NQ 204/2025 + NĐ 174/2025 (giảm 2% GTGT) hết hạn
      31/12/2026 → ăn uống 2,4% về 3% nếu không gia hạn (cảnh báo sẵn ở
      `einvoice-tax.md` §2.2).

## 5. Đã sửa gì trong code (T3 — 2026-06-16)

Thay đổi **chỉ** ở bảng hằng số `packages/shared/src/payroll/legal-versions.ts`
(không migration DB — hằng số là TS, engine ghi đè default cột DB):

- version `2026-01-01`: `pitBrackets` 7 bậc → **5 bậc**; giảm trừ + trần BHXH giữ.
- version `2026-07-01`: `insuranceCap` 46,8tr → **50,6tr**.
- Test: `legal-versions.test.ts` viết lại + `apps/web/tests/hr-payroll-hkd.test.ts`
  cập nhật (1 assertion 7-bậc cũ → 5-bậc); regression rule
  `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`.
- Gate đã chạy ở sandbox: `tsc --noEmit` (shared) + eslint + 15/15 test xanh.
  Full `pnpm build`/CI chạy ở máy owner (macOS) trước khi commit; **chưa commit**.

## 6. Nguồn tham chiếu (kiểm chứng 06/2026)

- NQ 198/2025/QH15 (bỏ thuế khoán + môn bài): vbpl.vn; thuvienphapluat.vn.
- NĐ 70/2025/NĐ-CP (HĐĐT máy tính tiền): xaydungchinhsach.chinhphu.vn.
- NĐ 68/2026/NĐ-CP (chính sách thuế HKD, phân nhóm, 17%): xaydungchinhsach.chinhphu.vn (toàn văn).
- NĐ 141/2026/NĐ-CP (ngưỡng 1 tỷ, hồi tố): xaydungchinhsach.chinhphu.vn (toàn văn).
- Luật TNCN 109/2025/QH15 + hiệu lực 01/01 vs 01/07/2026: thuvienphapluat.vn.
- NQ 204/2025/QH15 + NĐ 174/2025/NĐ-CP (giảm 2% GTGT): luatvietnam.vn; sme.misa.vn.
- NĐ 293/2025/NĐ-CP (lương tối thiểu vùng 2026): baochinhphu.vn; thuvienphapluat.vn.
- NĐ 161/2026/NĐ-CP (lương cơ sở 2,53tr / trần BHXH 50,6tr từ 01/07/2026): thuvienphapluat.vn; báo chí 06/2026.
- Luật BHXH 2024 + NĐ 158/2025 (chủ hộ HKD; 25% + BHYT 4,5%): baohiemxahoi.gov.vn; baochinhphu.vn.
- TT 152/2025/TT-BTC (kế toán HKD): luatvietnam.vn; chinhphu.vn.

# Kế hoạch chuyển đổi phân quyền Company → Tenant → Branch

> Trạng thái: đề xuất triển khai T3
> Authority: ADR 0015 — Authorization model
> Phạm vi: Auth, RLS, RPC, Server Action, route admission, navigation, Realtime và site agent. Không áp migration hoặc thay đổi Production theo tài liệu này.

## 1. Mục tiêu

Thay mô hình hiện hành `position_code → JWT user_role → MODULE_ACL → staff_permissions`
bằng phân quyền sống trong database, theo đúng hierarchy:

```text
Company
└── Tenant
    └── Branch
        └── Branch assignment của nhân sự
```

`Branch` là đơn vị vận hành duy nhất trong cây quyền. Kho Tổng và Bếp Trung
tâm vẫn là Branch, phân biệt bằng `branch_kind`; không tạo một cây `site`
song song.

Kết quả cần đạt:

- Chức danh HR không tạo, đổi hoặc thu hồi quyền hệ thống.
- Membership/assignment chỉ xác định quan hệ và scope, không tự cấp capability.
- Role binding cấp capability tại đúng Company, Tenant hoặc Branch.
- RLS và RPC đánh giá authority sống; JWT chỉ dùng identity/session chuẩn.
- Không còn Owner bypass, role JWT, ACL role-list hoặc direct per-user
  capability grant là authority.

## 2. Vocabulary và source of truth

| Khái niệm | Ý nghĩa | Source of truth | Không được suy ra |
| --- | --- | --- | --- |
| Company | Pháp nhân/chủ thể sở hữu Tenant | `companies` | Quyền Tenant/Branch |
| Tenant | Không gian dữ liệu, điều hành thuộc Company | `tenants` + tenant membership | Quyền Branch |
| Branch | Đơn vị vận hành thuộc Tenant | `branches` | Capability của nhân sự |
| Chức danh HR | Công việc, lương, ca, hồ sơ: Thu ngân, Bếp, Kế toán… | HR position/employment | Role/capability |
| Company membership | Người thuộc Company còn hiệu lực | Live relation | Quyền nghiệp vụ |
| Tenant membership | Company member thuộc Tenant còn hiệu lực | Live relation | Quyền nghiệp vụ |
| Branch assignment | Tenant member được phân công tại Branch | Live relation | Quyền nghiệp vụ |
| Authorization role | Gói capability, scope và ràng buộc lifecycle | Versioned catalog | Chức danh HR |
| Role binding | Cấp một role cho đúng membership/assignment | Audited live relation | Scope cha/con tự động |
| Capability | Hành động hẹp trên resource cụ thể | Versioned manifest | Route/UI quyền lực |

Luồng đúng là:

```text
Tạo nhân sự → gán chức danh HR → tạo identity
→ tạo membership/Branch assignment → cấp role binding
→ policy trong DB cho phép hoặc từ chối capability
```

Không bước nào trước `role binding` được tự cấp quyền.

## 3. Mô hình role

Role là gói capability; không tạo role cho mọi chức danh hoặc mọi biến thể cá
nhân. Một người có thể có nhiều binding ở các scope khác nhau.

| Scope | Role ban đầu | Nhiệm vụ | Không tự có |
| --- | --- | --- | --- |
| Company | `security_admin` | Quản lý membership, role binding, audit; bắt buộc AAL2 | Tài chính, bán hàng, kho |
| Tenant | `tenant_operations_admin` | Điều hành và cấu hình Tenant theo capability | Quản trị quyền Company |
| Tenant | `finance_operator` | Tài chính, báo cáo, phê duyệt tài chính | POS/KDS |
| Tenant | `hr_admin` | Hồ sơ nhân sự, hợp đồng, lương | Cấp role nếu không là Security Admin |
| Tenant | `procurement_operator` | Mua hàng, PO, GRN theo policy | Giá trị kho/finance ngoài capability |
| Tenant | `catalog_manager` | Menu, công thức và cấu hình dùng chung | Điều hành Branch |
| Branch | `branch_manager` | Điều hành đúng Branch được binding | Tenant-wide data |
| Branch | `cashier` | POS/thanh toán tại đúng Branch | KDS hoặc Branch khác |
| Branch | `kitchen_operator` | KDS/bếp tại đúng Branch | POS hoặc Branch khác |
| Branch | `branch_operator` | Ca làm và công việc Branch thông thường | POS/KDS specialty |
| Branch kind | `warehouse_operator` | Chỉ Branch có `branch_kind` là Kho Tổng | Production/Branch khác |
| Branch kind | `production_operator` | Chỉ Branch có `branch_kind` là Bếp Trung tâm | Warehouse/Branch khác |
| Machine | `branch_agent` | Identity máy cho một Branch | Human workflow hoặc `service_role` |

Ví dụ hợp lệ:

```text
security_admin   @ Company
finance_operator @ Tenant A
branch_manager   @ Branch 12
```

Ví dụ không hợp lệ: “Kế toán” là một position HR nên tự mở `/finance`, hoặc
Company membership tự làm người dùng đọc dữ liệu mọi Tenant/Branch.

### Role không thuộc Branch

Role Company/Tenant không bị buộc vào Branch. Tuy nhiên scope rộng hơn không
đồng nghĩa với toàn quyền cấp dưới:

- `security_admin @ Company` quản trị authority, không tự đọc doanh thu.
- `finance_operator @ Tenant` có thể đọc/tổng hợp dữ liệu các Branch trong
  Tenant khi capability và policy định nghĩa rõ; không tự vào POS/KDS.
- `procurement_operator @ Tenant` làm PO/GRN theo capability và ràng buộc
  `branch_kind`; không tự vận hành mọi Branch.
- Muốn thao tác tại một Branch, role/capability phải cho phép resource lineage
  đó một cách tường minh.

“Chủ sở hữu” là quan hệ pháp lý/HR, không phải universal role. Một chủ sở hữu
cần được cấp các binding cụ thể nếu thực sự làm Security Admin, vận hành Tenant
hoặc điều hành Branch.

## 4. Capability và policy contract

Mỗi capability có namespace nghiệp vụ, action, scope hợp lệ, sensitivity và
AAL tối thiểu. Ví dụ:

```text
pos.order.create
pos.payment.confirm
orders.refund.approve
finance.revenue.read
procurement.purchase_order.approve
staff.role_binding.manage
```

Route chỉ là coarse admission. RLS và RPC là authority cuối cùng.

Policy DB phải đánh giá cùng một câu hỏi:

```text
principal identity
→ active Company/Tenant membership hoặc Branch assignment
→ active, unexpired role binding
→ role contains required capability
→ binding scope matches resource lineage/status/branch kind
→ required AAL is satisfied
```

Không xây generic policy engine, JSON DSL, policy editor runtime, explicit deny
row hay direct per-user capability grants trong V1. Ngoại lệ là role hẹp có
scope, lý do và hạn dùng.

## 5. Pha 0 — Freeze và baseline read-only

1. Không thêm `user_role`, `permission_key`, role template hay `MODULE_ACL`
   entry mới ngoài hotfix an toàn đã được owner duyệt.
2. Xác minh Production ref theo Environment Registry trước mọi catalog read.
3. Kiểm kê:
   - `profiles`, `positions`, `staff_permissions`, `role_templates`,
     `permission_keys`;
   - JWT hook, `auth_role()`, `has_permission()`, RLS policies và RPC
     `SECURITY DEFINER`;
   - mọi Server Action, route, Realtime topic, Storage policy và agent đọc
     `user_role`, `branch_id`, `position_code` hoặc Owner bypass.
4. Lập ma trận current-state: subject × route × action × resource × scope.
5. Đo latency baseline cho login, POS, KDS, GRN, refund và quản trị nhân sự.

Exit: owner xác nhận baseline và danh sách authority cũ; không có thay đổi dữ
liệu hoặc schema.

## 6. Pha 1 — Authority design sign-off

1. Chốt capability manifest versioned, role catalog và mapping role →
   capability.
2. Chốt route-capability registry. Route không có registry phải fail closed.
3. Chốt policy matrix theo subject, action, resource, scope, lifecycle và AAL.
4. Chốt canonical `branch_kind` cho Branch bán hàng, Kho Tổng và Bếp Trung tâm.
5. Chỉ định chính xác first `security_admin` và owner-run bootstrap procedure.
6. Chốt mapping một lần từ role/grant cũ sang binding mới; Position chỉ là
   gợi ý migration, không là authority mới.

Exit: quyết định owner bằng văn bản trước migration đầu tiên.

## 7. Pha 2 — Database authority core

Tạo migration theo thứ tự additive sau:

1. Company, Company membership, Tenant membership và Branch assignment với
   lifecycle rõ ràng.
2. Catalog role/capability được seed từ manifest versioned; không có UI editor
   cho catalog này.
3. `role_bindings` tham chiếu đúng lifecycle row:
   - Company role → Company membership;
   - Tenant role → Tenant membership;
   - Branch role → Branch assignment;
   - expiry, reason, issuer, approver và idempotency/audit bắt buộc.
4. `provisioning_requests` để reconcile partial Auth Admin API operation.
5. Private typed policy functions cho Company, Tenant và Branch.
6. Narrow `api` RPC cho bootstrap, membership/assignment lifecycle và
   grant/revoke binding. Direct Data API DML vào authorization tables bị revoke.

Invariant bắt buộc:

- Membership/assignment lifecycle kết thúc thì binding liên quan fail closed.
- Rehire/reassignment tạo lifecycle row mới; binding cũ không sống lại.
- Binding Branch không thể trỏ Branch khác Tenant hoặc sai `branch_kind`.
- Security Admin binding mutation cần AAL2, reason và audit.
- Human RPC không cấp machine-only role; agent không nhận `service_role`.

Exit: account/membership/assignment chưa có binding không làm được nghiệp vụ.

## 8. Pha 3 — Chuyển enforcement sang capability sống

1. Chuyển từng RLS policy từ JWT role/profile scope/staff grant sang policy
   function mới.
2. Chuyển từng domain RPC sang `require capability at resource` trong transaction:
   - POS/payment/void/refund;
   - procurement/GRN/valuation/transfer/production;
   - HR/payroll/contract/attendance;
   - account, membership và role binding management.
3. Chuyển Server Action sang authorization context theo capability + resource,
   luôn giữ Zod tại trust boundary.
4. Chuyển Realtime và Storage sang evaluator mới; kiểm chứng revoke qua refresh
   hoặc reconnect.
5. Service-role code chỉ derive actor/scope từ trusted server context, không từ
   client input.

Không dùng transition `legacy allows OR new allows`: đó là bypass. Legacy chỉ
được dùng để so sánh read-only trong shadow evaluation.

Exit: PostgREST, RPC và Server Action cùng từ chối một subject không có
capability.

## 9. Pha 4 — Route, navigation và UX

1. Proxy chỉ dùng JWT identity/session chuẩn, không đọc role/scope custom claim.
2. Proxy lấy snapshot capability sống theo request; không warm-cache quyền có
   thể làm revoke bị trễ.
3. Thay `MODULE_ACL` bằng generated route-capability registry.
4. Navigation/default landing/access denied chỉ render projection capability;
   không tự là authority.
5. Tách UI `/hr` thành:
   - Nhân sự và chức danh HR;
   - Quyền hệ thống (role binding), chỉ Security Admin thao tác.
6. UI role binding hiển thị scope, capability summary, lý do, hạn dùng, người
   cấp và người duyệt. Không có form cấp một capability trực tiếp cho một user.
7. Khi đổi Position hoặc Branch assignment, UI nói rõ quyền hệ thống không đổi.

Exit: đổi chức danh HR không thay menu, route hay action permission.

## 10. Pha 5 — Shadow migration và cutover cohort

1. Owner duyệt mapping user/grant cũ → membership/assignment/binding mới.
2. Bootstrap first Security Admin bằng owner-run audited candidate procedure.
3. Provision cohort ít nhạy cảm trước; shadow chỉ log mismatch aggregate và
   không nới quyền theo legacy.
4. Cutover tuần tự:
   1. Security Admin;
   2. Branch Manager và Branch staff;
   3. Cashier/Kitchen;
   4. Warehouse/Production;
   5. Finance/Procurement;
   6. Owner/oversight.
5. Mỗi cohort có positive/negative matrix, rollback admission rõ ràng và owner
   sign-off trước cohort kế tiếp.

Exit: mọi user active có binding mới hợp lệ; không cần JWT role/direct grant để
vận hành.

## 11. Pha 6 — Retire legacy

Chỉ sau khi caller cuối cùng đã chuyển:

1. Bỏ custom access-token hook và authorization claims.
2. Bỏ position-to-role mapper, SQL twin, `auth_role()` legacy và `MODULE_ACL`.
3. Bỏ Owner universal bypass, role-based landing và ACL generator cũ.
4. Bỏ `staff_permissions`, `permission_keys`, `role_templates` cùng grant/revoke
   RPC/UI legacy.
5. Regenerate database types, route/capability matrix và CodeGraph.
6. Cập nhật module/spec chỉ còn một authority contract.

Không xóa migration đã áp. Legacy được retire bằng forward migration theo
database rules sau khi consumer đã dừng đọc nó.

## 12. Verification matrix

| Tình huống | Expected result |
| --- | --- |
| Chỉ có account | Deny mọi nghiệp vụ |
| Có HR position, không binding | Deny |
| Có membership/assignment, không binding | Deny |
| Cashier Branch A vào Branch B | Deny |
| Finance role Tenant vào POS/KDS | Deny |
| Finance role đọc tổng hợp Branch thuộc Tenant | Chỉ allow khi capability định nghĩa |
| Security Admin | Quản trị binding, không tự có quyền tiền/vận hành |
| Thu hồi/hết hạn binding | Deny ở lần policy check tiếp theo |
| Rehire/reassign | Binding cũ không được tái hoạt hóa |
| JWT chèn `owner` hoặc `branch_id` giả | Không ảnh hưởng quyền |
| Route thiếu registry | Fail closed |
| Authenticated DML authorization table | Deny |
| Agent Branch A gọi Branch B | Deny |
| Binding nhạy cảm thiếu AAL2 | Deny |

Verification cần có SQL/RLS/RPC matrix, unit tests manifest/registry, Server
Action contract tests, authenticated Preview smoke và `typecheck`, `lint`,
`build`, `test`. Production migration/apply chỉ làm khi owner ủy quyền chính
xác cho từng operation.

## 13. Review T3 và non-goals

| Lens | Kết luận |
| --- | --- |
| PM | Nhân sự biết rõ công việc và quyền ở đâu; không cần hiểu JWT/template. |
| BA | Position, assignment, role và capability có source of truth riêng; không có suy luận ngầm. |
| Senior Dev | DB là evaluator dùng chung cho RLS/RPC; TypeScript chỉ projection, không dựng authority thứ hai. |
| QA/Security | Test đủ subject × action × scope, đặc biệt revocation, cross-Branch, AAL2 và forged claims. |

Ngoài scope V1: policy engine tổng quát, JSON rule DSL, quyền lẻ per-user,
delegation matrix, runtime role/capability editor và multi-tenant expansion
chưa có nhu cầu nghiệp vụ chứng minh.

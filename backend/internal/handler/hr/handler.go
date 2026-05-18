// Package hr serves the admin-side HR/Payroll endpoints mounted at /hr.
//
// Ports the Node server actions under apps/web/app/hr/*. Three downstream
// payroll-compute endpoints (calculate, annual summary, insurance summary)
// return 501 NotImplemented for now — the Vietnamese PIT/insurance
// calculation lib at packages/shared/src/payroll/ has not been ported to Go
// yet. Tracked as a follow-up; the CRUD surface is complete.
package hr

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves /hr/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for fine-grained perm gates per endpoint
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns the chi.Router mounted at /hr.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Employees
	r.Get("/employees", h.listEmployees)
	r.Post("/employees", h.createEmployee)
	r.Get("/employees/branch", h.listEmployeesForBranch)

	// Shifts (definitions)
	r.Get("/shifts", h.listShifts)
	r.Post("/shifts", h.createShift)

	// Attendance
	r.Get("/attendance", h.listAttendance)
	r.Get("/attendance/summary", h.attendanceSummary)
	r.Post("/attendance/check-in", h.checkIn)
	r.Post("/attendance/check-out", h.checkOut)
	r.Post("/attendance/bulk-check-in", h.bulkCheckIn)
	r.Patch("/attendance/{id}", h.updateAttendance)

	// Contracts
	r.Get("/contracts", h.listContracts)
	r.Post("/contracts", h.createContract)
	r.Post("/contracts/{id}/terminate", h.terminateContract)

	// Shift assignments (manager-set rosters)
	r.Get("/shift-assignments", h.listShiftAssignments)
	r.Post("/shift-assignments", h.createShiftAssignment)
	r.Delete("/shift-assignments/{id}", h.deleteShiftAssignment)

	// Shift requests (employee-initiated; manager approves/rejects)
	r.Get("/shift-requests", h.listShiftRequests)
	r.Post("/shift-requests/{id}/approve", h.approveShiftRequest)
	r.Post("/shift-requests/{id}/reject", h.rejectShiftRequest)

	// Payroll periods + entries
	r.Get("/payroll/periods", h.listPayrollPeriods)
	r.Post("/payroll/periods", h.createPayrollPeriod)
	r.Get("/payroll/periods/{id}/entries", h.listPayrollEntries)
	r.Post("/payroll/periods/{id}/approve", h.approvePayroll)
	r.Post("/payroll/periods/{id}/pay", h.markPayrollPaid)

	// Payroll compute + reports — deferred (PIT/insurance calc not yet ported)
	r.Post("/payroll/periods/{id}/calculate", h.notImplementedPayrollCalc)
	r.Get("/payroll/reports/annual", h.notImplementedPayrollSummary)
	r.Get("/payroll/reports/insurance", h.notImplementedInsuranceSummary)

	return r
}

// ─── shared helpers ─────────────────────────────────────────────────────────

var (
	datePattern  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	monthPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)
	timePattern  = regexp.MustCompile(`^\d{2}:\d{2}$`)
)

// claimsOrUnauthorized returns the request claims; on absence it writes 401
// and returns nil so the caller can early-return.
func claimsOrUnauthorized(w http.ResponseWriter, r *http.Request) *auth.Claims {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return nil
	}
	return claims
}

// requireBranchAccess returns true when the caller can act on branchID. The
// rule mirrors the Node `canAccessBranch` helper: branch-scoped roles
// (branch_manager + WaiterTypes) can only access their JWT branch_id. Tenant-
// wide roles (owner, super_manager, area_manager) can access any branch.
func requireBranchAccess(claims *auth.Claims, branchID int64) bool {
	if claims.BranchID == nil {
		return true // tenant-wide role
	}
	return *claims.BranchID == branchID
}

// mapRPCError maps a SQLSTATE returned by an HR RPC to an HTTP status + a
// Vietnamese user-facing message. Mirrors the per-message branches in the
// Node actions. Falls back to 500 + fallbackMsg on unknown codes.
func mapRPCError(err error, fallbackMsg string) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			switch {
			case strings.Contains(pgErr.Message, "contract_number"):
				return http.StatusConflict, "Số hợp đồng đã tồn tại."
			case strings.Contains(pgErr.Message, "payroll_periods"):
				return http.StatusConflict, "Kỳ lương đã tồn tại."
			default:
				return http.StatusConflict, "Bản ghi đã tồn tại."
			}
		case "42501", "28000": // insufficient_privilege / not_authenticated
			switch {
			case strings.Contains(pgErr.Message, "cannot approve own"):
				return http.StatusForbidden, "Không thể tự duyệt đăng ký của mình."
			case strings.Contains(pgErr.Message, "missing permission"):
				return http.StatusForbidden, "Không có quyền duyệt cho chi nhánh này."
			default:
				return http.StatusForbidden, fallbackMsg
			}
		case "P0002": // no_data_found
			return http.StatusNotFound, "Không tìm thấy đăng ký."
		case "23514", "P0001": // check_violation or RAISE
			if strings.Contains(pgErr.Message, "not pending") {
				return http.StatusConflict, "Đăng ký không còn ở trạng thái chờ duyệt."
			}
			return http.StatusUnprocessableEntity, fallbackMsg
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

// ─── /hr/employees ──────────────────────────────────────────────────────────

type employee struct {
	ID              int64   `json:"id"`
	ProfileID       string  `json:"profile_id"`
	EmployeeCode    *string `json:"employee_code"`
	IDNumber        *string `json:"id_number"`
	BankAccount     *string `json:"bank_account"`
	BankName        *string `json:"bank_name"`
	BaseSalary      *string `json:"base_salary"`
	StartDate       *string `json:"start_date"`
	ContractType    *string `json:"contract_type"`
	DependentsCount int     `json:"dependents_count"`
	IsActive        bool    `json:"is_active"`
	FullName        *string `json:"full_name"`
	Phone           *string `json:"phone"`
	BranchID        *int64  `json:"branch_id"`
	BranchName      *string `json:"branch_name"`
}

func (h *Handler) listEmployees(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	const q = `
		SELECT e.id, e.profile_id, e.employee_code, e.id_number, e.bank_account, e.bank_name,
		       e.base_salary, e.start_date, e.contract_type, e.dependents_count, e.is_active,
		       p.full_name, p.phone, p.branch_id, b.name
		FROM public.employees e
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		LEFT JOIN public.branches b ON b.id = p.branch_id AND b.tenant_id = e.tenant_id
		WHERE e.tenant_id = $1
		ORDER BY e.created_at DESC`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách nhân viên.")
		return
	}
	defer rows.Close()

	out := make([]employee, 0)
	for rows.Next() {
		var e employee
		var code, idn, ba, bn, ct, fn, ph, brName sql.NullString
		var sd sql.NullTime
		var bs sql.NullString
		var brID sql.NullInt64
		if err := rows.Scan(&e.ID, &e.ProfileID, &code, &idn, &ba, &bn,
			&bs, &sd, &ct, &e.DependentsCount, &e.IsActive,
			&fn, &ph, &brID, &brName); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read employee row")
			return
		}
		e.EmployeeCode = nullStr(code)
		e.IDNumber = nullStr(idn)
		e.BankAccount = nullStr(ba)
		e.BankName = nullStr(bn)
		e.BaseSalary = nullStr(bs)
		if sd.Valid {
			s := sd.Time.Format("2006-01-02")
			e.StartDate = &s
		}
		e.ContractType = nullStr(ct)
		e.FullName = nullStr(fn)
		e.Phone = nullStr(ph)
		if brID.Valid {
			v := brID.Int64
			e.BranchID = &v
		}
		e.BranchName = nullStr(brName)
		out = append(out, e)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"employees": out})
}

type createEmployeeRequest struct {
	ProfileID       string  `json:"profile_id"`
	EmployeeCode    *string `json:"employee_code"`
	IDNumber        *string `json:"id_number"`
	BankAccount     *string `json:"bank_account"`
	BankName        *string `json:"bank_name"`
	BaseSalary      *string `json:"base_salary"`
	StartDate       *string `json:"start_date"`
	ContractType    *string `json:"contract_type"`
	DependentsCount int     `json:"dependents_count"`
}

func (h *Handler) createEmployee(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req createEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ProfileID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "profile_id is required")
		return
	}
	if req.DependentsCount < 0 {
		req.DependentsCount = 0
	}

	const q = `INSERT INTO public.employees
		(tenant_id, profile_id, employee_code, id_number, bank_account, bank_name,
		 base_salary, start_date, contract_type, dependents_count)
		VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::numeric, $8::date, $9, $10)
		RETURNING id`
	var id int64
	err := h.pool.QueryRow(r.Context(), q,
		claims.TenantID, req.ProfileID, req.EmployeeCode, req.IDNumber,
		req.BankAccount, req.BankName, req.BaseSalary, req.StartDate,
		req.ContractType, req.DependentsCount,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Nhân viên này đã có hồ sơ.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo hồ sơ nhân viên.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) listEmployeesForBranch(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	const q = `
		SELECT e.id, e.employee_code, p.full_name
		FROM public.employees e
		JOIN public.profiles p ON p.id = e.profile_id
		WHERE e.tenant_id = $1 AND e.is_active = true AND p.branch_id = $2`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách nhân viên.")
		return
	}
	defer rows.Close()

	type row struct {
		ID           int64   `json:"id"`
		EmployeeCode *string `json:"employee_code"`
		FullName     *string `json:"full_name"`
	}
	out := make([]row, 0)
	for rows.Next() {
		var rr row
		var code, fn sql.NullString
		if err := rows.Scan(&rr.ID, &code, &fn); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read employee row")
			return
		}
		rr.EmployeeCode = nullStr(code)
		rr.FullName = nullStr(fn)
		out = append(out, rr)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"employees": out})
}

// ─── /hr/shifts ─────────────────────────────────────────────────────────────

type shift struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	IsActive  bool   `json:"is_active"`
}

func (h *Handler) listShifts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	const q = `SELECT id, name, start_time, end_time, is_active
		FROM public.shifts
		WHERE branch_id = $1 AND tenant_id = $2
		ORDER BY start_time`
	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách ca.")
		return
	}
	defer rows.Close()
	out := make([]shift, 0)
	for rows.Next() {
		var s shift
		var st, et time.Time
		if err := rows.Scan(&s.ID, &s.Name, &st, &et, &s.IsActive); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read shift")
			return
		}
		s.StartTime = st.Format("15:04")
		s.EndTime = et.Format("15:04")
		out = append(out, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"shifts": out})
}

type createShiftRequest struct {
	BranchID  int64  `json:"branch_id"`
	Name      string `json:"name"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

func (h *Handler) createShift(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req createShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 || strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Tên ca không được để trống")
		return
	}
	if !timePattern.MatchString(req.StartTime) {
		httputil.WriteError(w, http.StatusBadRequest, "Giờ bắt đầu không hợp lệ (HH:MM)")
		return
	}
	if !timePattern.MatchString(req.EndTime) {
		httputil.WriteError(w, http.StatusBadRequest, "Giờ kết thúc không hợp lệ (HH:MM)")
		return
	}
	if !requireBranchAccess(claims, req.BranchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	const q = `INSERT INTO public.shifts (tenant_id, branch_id, name, start_time, end_time)
		VALUES ($1, $2, $3, $4::time, $5::time)
		RETURNING id`
	var id int64
	err := h.pool.QueryRow(r.Context(), q,
		claims.TenantID, req.BranchID, req.Name, req.StartTime, req.EndTime,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Ca này đã tồn tại.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo ca.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// ─── /hr/attendance ─────────────────────────────────────────────────────────

type attendanceRow struct {
	ID           int64   `json:"id"`
	Date         string  `json:"date"`
	CheckIn      *string `json:"check_in"`
	CheckOut     *string `json:"check_out"`
	Status       string  `json:"status"`
	Note         *string `json:"note"`
	EmployeeID   int64   `json:"employee_id"`
	EmployeeCode *string `json:"employee_code"`
	FullName     *string `json:"full_name"`
	ShiftName    *string `json:"shift_name"`
	ShiftStart   *string `json:"shift_start"`
	ShiftEnd     *string `json:"shift_end"`
}

func (h *Handler) listAttendance(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	month := r.URL.Query().Get("month")
	if !monthPattern.MatchString(month) {
		httputil.WriteError(w, http.StatusBadRequest, "month must be YYYY-MM")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}
	start, end, err := monthBoundaries(month)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid month")
		return
	}

	const q = `
		SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.note,
		       a.employee_id, e.employee_code, p.full_name,
		       s.name, s.start_time, s.end_time
		FROM public.attendance_records a
		JOIN public.employees e ON e.id = a.employee_id
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		LEFT JOIN public.shifts s ON s.id = a.shift_id
		WHERE a.branch_id = $1 AND a.tenant_id = $2 AND a.date BETWEEN $3 AND $4
		ORDER BY a.date, a.employee_id`
	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID, start, end)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải bảng chấm công.")
		return
	}
	defer rows.Close()

	out := make([]attendanceRow, 0)
	for rows.Next() {
		var a attendanceRow
		var date time.Time
		var ci, co sql.NullTime
		var note, code, fn, sName sql.NullString
		var sStart, sEnd sql.NullTime
		if err := rows.Scan(&a.ID, &date, &ci, &co, &a.Status, &note,
			&a.EmployeeID, &code, &fn, &sName, &sStart, &sEnd); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read attendance row")
			return
		}
		a.Date = date.Format("2006-01-02")
		if ci.Valid {
			v := ci.Time.Format(time.RFC3339)
			a.CheckIn = &v
		}
		if co.Valid {
			v := co.Time.Format(time.RFC3339)
			a.CheckOut = &v
		}
		a.Note = nullStr(note)
		a.EmployeeCode = nullStr(code)
		a.FullName = nullStr(fn)
		a.ShiftName = nullStr(sName)
		if sStart.Valid {
			v := sStart.Time.Format("15:04")
			a.ShiftStart = &v
		}
		if sEnd.Valid {
			v := sEnd.Time.Format("15:04")
			a.ShiftEnd = &v
		}
		out = append(out, a)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"records": out})
}

type attendanceSummaryRow struct {
	EmployeeID   int64   `json:"employee_id"`
	EmployeeCode *string `json:"employee_code"`
	FullName     *string `json:"full_name"`
	Present      int     `json:"present"`
	Late         int     `json:"late"`
	Absent       int     `json:"absent"`
	HalfDay      int     `json:"half_day"`
	Total        int     `json:"total"`
}

func (h *Handler) attendanceSummary(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	month := r.URL.Query().Get("month")
	if !monthPattern.MatchString(month) {
		httputil.WriteError(w, http.StatusBadRequest, "month must be YYYY-MM")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}
	start, end, err := monthBoundaries(month)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid month")
		return
	}

	// Aggregate in SQL — cheaper than streaming all rows.
	const q = `
		SELECT a.employee_id, e.employee_code, p.full_name,
		       COUNT(*) FILTER (WHERE a.status = 'present')   AS present,
		       COUNT(*) FILTER (WHERE a.status = 'late')      AS late,
		       COUNT(*) FILTER (WHERE a.status = 'absent')    AS absent,
		       COUNT(*) FILTER (WHERE a.status = 'half_day')  AS half_day,
		       COUNT(*) AS total
		FROM public.attendance_records a
		JOIN public.employees e ON e.id = a.employee_id
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		WHERE a.branch_id = $1 AND a.tenant_id = $2 AND a.date BETWEEN $3 AND $4
		GROUP BY a.employee_id, e.employee_code, p.full_name
		ORDER BY a.employee_id`
	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID, start, end)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải tổng hợp chấm công.")
		return
	}
	defer rows.Close()

	out := make([]attendanceSummaryRow, 0)
	for rows.Next() {
		var s attendanceSummaryRow
		var code, fn sql.NullString
		if err := rows.Scan(&s.EmployeeID, &code, &fn, &s.Present, &s.Late, &s.Absent, &s.HalfDay, &s.Total); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read summary row")
			return
		}
		s.EmployeeCode = nullStr(code)
		s.FullName = nullStr(fn)
		out = append(out, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"summary": out})
}

type checkInRequest struct {
	BranchID   int64  `json:"branch_id"`
	EmployeeID int64  `json:"employee_id"`
	ShiftID    *int64 `json:"shift_id"`
	Date       string `json:"date"`
}

func (h *Handler) checkIn(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req checkInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 || req.EmployeeID <= 0 || !datePattern.MatchString(req.Date) {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id, employee_id, date are required")
		return
	}
	if !requireBranchAccess(claims, req.BranchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}
	const q = `
		INSERT INTO public.attendance_records
		(tenant_id, branch_id, employee_id, shift_id, date, check_in, status)
		VALUES ($1, $2, $3, $4, $5::date, now(), 'present')
		ON CONFLICT (employee_id, date, tenant_id) DO UPDATE SET
		  branch_id = EXCLUDED.branch_id,
		  shift_id  = COALESCE(EXCLUDED.shift_id, public.attendance_records.shift_id),
		  check_in  = COALESCE(public.attendance_records.check_in, EXCLUDED.check_in),
		  status    = 'present'
		RETURNING id`
	var id int64
	if err := h.pool.QueryRow(r.Context(), q,
		claims.TenantID, req.BranchID, req.EmployeeID, req.ShiftID, req.Date,
	).Scan(&id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm công vào.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"id": id})
}

type checkOutRequest struct {
	AttendanceID int64 `json:"attendance_id"`
}

func (h *Handler) checkOut(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req checkOutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AttendanceID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "attendance_id is required")
		return
	}
	args := []any{req.AttendanceID, claims.TenantID}
	branchFilter := ""
	if claims.BranchID != nil {
		args = append(args, *claims.BranchID)
		branchFilter = " AND branch_id = $3"
	}
	q := fmt.Sprintf(`UPDATE public.attendance_records
		SET check_out = now()
		WHERE id = $1 AND tenant_id = $2%s
		RETURNING id`, branchFilter)
	var id int64
	err := h.pool.QueryRow(r.Context(), q, args...).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "Không thể chấm công ra.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm công ra.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type bulkCheckInRequest struct {
	BranchID    int64   `json:"branch_id"`
	EmployeeIDs []int64 `json:"employee_ids"`
	Date        string  `json:"date"`
	ShiftID     *int64  `json:"shift_id"`
}

func (h *Handler) bulkCheckIn(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req bulkCheckInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 || len(req.EmployeeIDs) == 0 || !datePattern.MatchString(req.Date) {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id, employee_ids, date are required")
		return
	}
	if !requireBranchAccess(claims, req.BranchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	// Insert via single statement with unnest — N rows, one round trip.
	const q = `
		INSERT INTO public.attendance_records
		(tenant_id, branch_id, employee_id, shift_id, date, check_in, status)
		SELECT $1, $2, eid, $3, $4::date, now(), 'present'
		FROM unnest($5::bigint[]) AS eid
		ON CONFLICT (employee_id, date, tenant_id) DO UPDATE SET
		  branch_id = EXCLUDED.branch_id,
		  shift_id  = COALESCE(EXCLUDED.shift_id, public.attendance_records.shift_id),
		  check_in  = COALESCE(public.attendance_records.check_in, EXCLUDED.check_in),
		  status    = 'present'`
	tag, err := h.pool.Exec(r.Context(), q,
		claims.TenantID, req.BranchID, req.ShiftID, req.Date, req.EmployeeIDs,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm công hàng loạt.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"count": tag.RowsAffected()})
}

type updateAttendanceRequest struct {
	Status string  `json:"status"`
	Note   *string `json:"note"`
}

func (h *Handler) updateAttendance(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid attendance id")
		return
	}
	var req updateAttendanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch req.Status {
	case "present", "absent", "late", "half_day":
		// ok
	default:
		httputil.WriteError(w, http.StatusBadRequest, "invalid status")
		return
	}

	args := []any{req.Status, req.Note, id, claims.TenantID}
	branchFilter := ""
	if claims.BranchID != nil {
		args = append(args, *claims.BranchID)
		branchFilter = " AND branch_id = $5"
	}
	q := fmt.Sprintf(`UPDATE public.attendance_records
		SET status = $1, note = $2
		WHERE id = $3 AND tenant_id = $4%s
		RETURNING id`, branchFilter)
	var updated int64
	err = h.pool.QueryRow(r.Context(), q, args...).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "Không thể cập nhật trạng thái.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật trạng thái.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── /hr/contracts ──────────────────────────────────────────────────────────

type contract struct {
	ID                  int64   `json:"id"`
	EmployeeID          int64   `json:"employee_id"`
	ContractType        string  `json:"contract_type"`
	ContractNumber      string  `json:"contract_number"`
	SignedDate          string  `json:"signed_date"`
	StartDate           string  `json:"start_date"`
	EndDate             *string `json:"end_date"`
	ProbationEndDate    *string `json:"probation_end_date"`
	GrossSalary         string  `json:"gross_salary"`
	InsuranceBaseSalary string  `json:"insurance_base_salary"`
	Position            string  `json:"position"`
	WorkLocation        *string `json:"work_location"`
	ContractSequence    int     `json:"contract_sequence"`
	DocumentURL         *string `json:"document_url"`
	Status              string  `json:"status"`
}

func (h *Handler) listContracts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	employeeID, err := strconv.ParseInt(r.URL.Query().Get("employee_id"), 10, 64)
	if err != nil || employeeID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "employee_id is required")
		return
	}
	const q = `
		SELECT id, employee_id, contract_type, contract_number, signed_date,
		       start_date, end_date, probation_end_date,
		       gross_salary, insurance_base_salary, position, work_location,
		       contract_sequence, document_url, status
		FROM public.employment_contracts
		WHERE employee_id = $1 AND tenant_id = $2
		ORDER BY start_date DESC`
	rows, err := h.pool.Query(r.Context(), q, employeeID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách hợp đồng.")
		return
	}
	defer rows.Close()
	out := make([]contract, 0)
	for rows.Next() {
		var c contract
		var signed, start time.Time
		var endDate, probEnd sql.NullTime
		var workLoc, docURL sql.NullString
		if err := rows.Scan(&c.ID, &c.EmployeeID, &c.ContractType, &c.ContractNumber, &signed,
			&start, &endDate, &probEnd,
			&c.GrossSalary, &c.InsuranceBaseSalary, &c.Position, &workLoc,
			&c.ContractSequence, &docURL, &c.Status); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read contract row")
			return
		}
		c.SignedDate = signed.Format("2006-01-02")
		c.StartDate = start.Format("2006-01-02")
		if endDate.Valid {
			v := endDate.Time.Format("2006-01-02")
			c.EndDate = &v
		}
		if probEnd.Valid {
			v := probEnd.Time.Format("2006-01-02")
			c.ProbationEndDate = &v
		}
		c.WorkLocation = nullStr(workLoc)
		c.DocumentURL = nullStr(docURL)
		out = append(out, c)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"contracts": out})
}

type createContractRequest struct {
	EmployeeID          int64   `json:"employee_id"`
	ContractType        string  `json:"contract_type"`
	ContractNumber      string  `json:"contract_number"`
	SignedDate          string  `json:"signed_date"`
	StartDate           string  `json:"start_date"`
	EndDate             *string `json:"end_date"`
	ProbationEndDate    *string `json:"probation_end_date"`
	GrossSalary         string  `json:"gross_salary"`
	InsuranceBaseSalary string  `json:"insurance_base_salary"`
	Position            string  `json:"position"`
	WorkLocation        *string `json:"work_location"`
	DocumentURL         *string `json:"document_url"`
}

func (h *Handler) createContract(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req createContractRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EmployeeID <= 0 || req.ContractNumber == "" || req.Position == "" {
		httputil.WriteError(w, http.StatusBadRequest, "employee_id, contract_number, position are required")
		return
	}
	switch req.ContractType {
	case "indefinite", "fixed_term", "seasonal", "probation":
		// ok
	default:
		httputil.WriteError(w, http.StatusBadRequest, "invalid contract_type")
		return
	}

	// Determine contract sequence + enforce BLLĐ 2019 Art 20 (3rd fixed_term must be indefinite).
	var count int
	if err := h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM public.employment_contracts
		 WHERE employee_id = $1 AND tenant_id = $2`,
		req.EmployeeID, claims.TenantID,
	).Scan(&count); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải lịch sử hợp đồng.")
		return
	}
	seq := count + 1
	if req.ContractType == "fixed_term" && seq >= 3 {
		httputil.WriteError(w, http.StatusUnprocessableEntity,
			"Đã ký 2 HĐ xác định thời hạn. Theo Điều 20 BLLĐ 2019, hợp đồng thứ 3 phải là không xác định thời hạn.")
		return
	}

	// Expire prior active contracts + insert new contract atomically.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể bắt đầu giao dịch.")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	if _, err := tx.Exec(r.Context(),
		`UPDATE public.employment_contracts
		   SET status = 'expired', updated_at = now()
		 WHERE employee_id = $1 AND tenant_id = $2 AND status = 'active'`,
		req.EmployeeID, claims.TenantID,
	); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể hết hạn hợp đồng cũ. Vui lòng thử lại.")
		return
	}

	const insertQ = `
		INSERT INTO public.employment_contracts
		(tenant_id, employee_id, contract_type, contract_number, signed_date, start_date,
		 end_date, probation_end_date, gross_salary, insurance_base_salary, position,
		 work_location, contract_sequence, document_url, status)
		VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::date, $8::date,
		        $9::numeric, $10::numeric, $11, $12, $13, $14, 'active')
		RETURNING id, contract_number`
	var newID int64
	var newNumber string
	err = tx.QueryRow(r.Context(), insertQ,
		claims.TenantID, req.EmployeeID, req.ContractType, req.ContractNumber,
		req.SignedDate, req.StartDate, req.EndDate, req.ProbationEndDate,
		req.GrossSalary, req.InsuranceBaseSalary, req.Position, req.WorkLocation,
		seq, req.DocumentURL,
	).Scan(&newID, &newNumber)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Số hợp đồng đã tồn tại.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo hợp đồng.")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo hợp đồng.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": newID, "contract_number": newNumber})
}

type terminateContractRequest struct {
	Reason     string `json:"reason"`
	NoticeDate string `json:"notice_date"`
}

func (h *Handler) terminateContract(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid contract id")
		return
	}
	var req terminateContractRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "Lý do không được trống")
		return
	}
	if !datePattern.MatchString(req.NoticeDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày báo trước không hợp lệ")
		return
	}

	const q = `UPDATE public.employment_contracts
		SET status = 'terminated', terminated_at = now()::date,
		    termination_notice_date = $1::date, termination_reason = $2
		WHERE id = $3 AND tenant_id = $4 AND status = 'active'
		RETURNING id`
	var updated int64
	err = h.pool.QueryRow(r.Context(), q, req.NoticeDate, req.Reason, id, claims.TenantID).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusConflict, "Không thể chấm dứt hợp đồng. Kiểm tra lại trạng thái.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm dứt hợp đồng. Kiểm tra lại trạng thái.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── /hr/shift-assignments ──────────────────────────────────────────────────

type shiftAssignment struct {
	ID           int64   `json:"id"`
	Date         string  `json:"date"`
	EmployeeID   int64   `json:"employee_id"`
	ShiftID      int64   `json:"shift_id"`
	ShiftName    *string `json:"shift_name"`
	StartTime    *string `json:"start_time"`
	EndTime      *string `json:"end_time"`
	EmployeeCode *string `json:"employee_code"`
	FullName     *string `json:"full_name"`
}

func (h *Handler) listShiftAssignments(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	weekStart := r.URL.Query().Get("week_start")
	if !datePattern.MatchString(weekStart) {
		httputil.WriteError(w, http.StatusBadRequest, "week_start must be YYYY-MM-DD")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}
	start, err := time.Parse("2006-01-02", weekStart)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid week_start")
		return
	}
	weekEnd := start.AddDate(0, 0, 6).Format("2006-01-02")

	const q = `
		SELECT sa.id, sa.date, sa.employee_id, sa.shift_id,
		       s.name, s.start_time, s.end_time,
		       e.employee_code, p.full_name
		FROM public.shift_assignments sa
		JOIN public.shifts s ON s.id = sa.shift_id
		JOIN public.employees e ON e.id = sa.employee_id
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		WHERE sa.branch_id = $1 AND sa.tenant_id = $2 AND sa.date BETWEEN $3 AND $4
		ORDER BY sa.date, sa.employee_id`
	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID, weekStart, weekEnd)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải phân ca.")
		return
	}
	defer rows.Close()
	out := make([]shiftAssignment, 0)
	for rows.Next() {
		var a shiftAssignment
		var date time.Time
		var sName, code, fn sql.NullString
		var sStart, sEnd sql.NullTime
		if err := rows.Scan(&a.ID, &date, &a.EmployeeID, &a.ShiftID, &sName, &sStart, &sEnd, &code, &fn); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read shift_assignment row")
			return
		}
		a.Date = date.Format("2006-01-02")
		a.ShiftName = nullStr(sName)
		if sStart.Valid {
			v := sStart.Time.Format("15:04")
			a.StartTime = &v
		}
		if sEnd.Valid {
			v := sEnd.Time.Format("15:04")
			a.EndTime = &v
		}
		a.EmployeeCode = nullStr(code)
		a.FullName = nullStr(fn)
		out = append(out, a)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"assignments": out})
}

type createShiftAssignmentRequest struct {
	BranchID   int64  `json:"branch_id"`
	EmployeeID int64  `json:"employee_id"`
	ShiftID    int64  `json:"shift_id"`
	Date       string `json:"date"`
}

func (h *Handler) createShiftAssignment(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req createShiftAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 || req.EmployeeID <= 0 || req.ShiftID <= 0 || !datePattern.MatchString(req.Date) {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id, employee_id, shift_id, date are required")
		return
	}
	if !requireBranchAccess(claims, req.BranchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	const q = `INSERT INTO public.shift_assignments
		(tenant_id, branch_id, employee_id, shift_id, date)
		VALUES ($1, $2, $3, $4, $5::date)
		RETURNING id`
	var id int64
	err := h.pool.QueryRow(r.Context(), q,
		claims.TenantID, req.BranchID, req.EmployeeID, req.ShiftID, req.Date,
	).Scan(&id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict, "Phân ca trùng lặp.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo phân ca.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (h *Handler) deleteShiftAssignment(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM public.shift_assignments WHERE id = $1 AND tenant_id = $2`,
		id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xóa phân ca.")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy phân ca.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── /hr/shift-requests ─────────────────────────────────────────────────────

type shiftRequest struct {
	ID             int64   `json:"id"`
	Status         string  `json:"status"`
	Date           string  `json:"date"`
	Note           *string `json:"note"`
	RejectedReason *string `json:"rejected_reason"`
	CreatedAt      string  `json:"created_at"`
	EmployeeID     int64   `json:"employee_id"`
	ShiftID        int64   `json:"shift_id"`
	BranchID       int64   `json:"branch_id"`
	ShiftName      *string `json:"shift_name"`
	StartTime      *string `json:"start_time"`
	EndTime        *string `json:"end_time"`
	EmployeeCode   *string `json:"employee_code"`
	FullName       *string `json:"full_name"`
}

func (h *Handler) listShiftRequests(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	if !requireBranchAccess(claims, branchID) {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền truy cập chi nhánh này")
		return
	}

	const q = `
		SELECT sr.id, sr.status, sr.date, sr.note, sr.rejected_reason, sr.created_at,
		       sr.employee_id, sr.shift_id, sr.branch_id,
		       s.name, s.start_time, s.end_time,
		       e.employee_code, p.full_name
		FROM public.shift_requests sr
		JOIN public.shifts s ON s.id = sr.shift_id
		JOIN public.employees e ON e.id = sr.employee_id
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		WHERE sr.tenant_id = $1 AND sr.branch_id = $2
		ORDER BY sr.date ASC, sr.created_at ASC`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách đăng ký ca.")
		return
	}
	defer rows.Close()
	out := make([]shiftRequest, 0)
	for rows.Next() {
		var sr shiftRequest
		var date time.Time
		var note, reason, sName, code, fn sql.NullString
		var sStart, sEnd sql.NullTime
		var createdAt time.Time
		if err := rows.Scan(&sr.ID, &sr.Status, &date, &note, &reason, &createdAt,
			&sr.EmployeeID, &sr.ShiftID, &sr.BranchID,
			&sName, &sStart, &sEnd, &code, &fn); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read shift_request row")
			return
		}
		sr.Date = date.Format("2006-01-02")
		sr.Note = nullStr(note)
		sr.RejectedReason = nullStr(reason)
		sr.CreatedAt = createdAt.Format(time.RFC3339)
		sr.ShiftName = nullStr(sName)
		if sStart.Valid {
			v := sStart.Time.Format("15:04")
			sr.StartTime = &v
		}
		if sEnd.Valid {
			v := sEnd.Time.Format("15:04")
			sr.EndTime = &v
		}
		sr.EmployeeCode = nullStr(code)
		sr.FullName = nullStr(fn)
		out = append(out, sr)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"requests": out})
}

func (h *Handler) approveShiftRequest(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request id")
		return
	}
	var assignmentID int64
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `SELECT public.approve_shift_request($1)`, id).Scan(&assignmentID)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể duyệt đăng ký.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"assignment_id": assignmentID})
}

type rejectShiftRequestBody struct {
	Reason *string `json:"reason"`
}

func (h *Handler) rejectShiftRequest(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request id")
		return
	}
	var body rejectShiftRequestBody
	// Body is optional — silently ignore decode error to allow empty body.
	_ = json.NewDecoder(r.Body).Decode(&body)

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.reject_shift_request($1, $2)`, id, body.Reason)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể từ chối đăng ký.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── /hr/payroll/periods ────────────────────────────────────────────────────

type payrollPeriod struct {
	ID          int64   `json:"id"`
	PeriodMonth int     `json:"period_month"`
	PeriodYear  int     `json:"period_year"`
	Status      string  `json:"status"`
	ApprovedBy  *string `json:"approved_by"`
	ApprovedAt  *string `json:"approved_at"`
	PaidAt      *string `json:"paid_at"`
	CreatedAt   string  `json:"created_at"`
}

func (h *Handler) listPayrollPeriods(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	const q = `SELECT id, period_month, period_year, status,
		       approved_by, approved_at, paid_at, created_at
		FROM public.payroll_periods
		WHERE tenant_id = $1
		ORDER BY period_year DESC, period_month DESC`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải kỳ lương.")
		return
	}
	defer rows.Close()
	out := make([]payrollPeriod, 0)
	for rows.Next() {
		var p payrollPeriod
		var by sql.NullString
		var at, paid sql.NullTime
		var created time.Time
		if err := rows.Scan(&p.ID, &p.PeriodMonth, &p.PeriodYear, &p.Status, &by, &at, &paid, &created); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read period row")
			return
		}
		p.ApprovedBy = nullStr(by)
		if at.Valid {
			v := at.Time.Format(time.RFC3339)
			p.ApprovedAt = &v
		}
		if paid.Valid {
			v := paid.Time.Format(time.RFC3339)
			p.PaidAt = &v
		}
		p.CreatedAt = created.Format(time.RFC3339)
		out = append(out, p)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"periods": out})
}

type createPayrollPeriodRequest struct {
	Month int `json:"month"`
	Year  int `json:"year"`
}

func (h *Handler) createPayrollPeriod(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	var req createPayrollPeriodRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Month < 1 || req.Month > 12 || req.Year < 2020 {
		httputil.WriteError(w, http.StatusBadRequest, "month must be 1-12; year ≥ 2020")
		return
	}
	const q = `INSERT INTO public.payroll_periods (tenant_id, period_month, period_year)
		VALUES ($1, $2, $3)
		RETURNING id, period_month, period_year, status`
	var id int64
	var month, year int
	var status string
	err := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.Month, req.Year).
		Scan(&id, &month, &year, &status)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httputil.WriteError(w, http.StatusConflict,
				fmt.Sprintf("Kỳ lương %d/%d đã tồn tại.", req.Month, req.Year))
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo kỳ lương.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"id":           id,
		"period_month": month,
		"period_year":  year,
		"status":       status,
	})
}

func (h *Handler) listPayrollEntries(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || periodID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid period id")
		return
	}
	const q = `
		SELECT pe.*, e.employee_code, p.full_name
		FROM public.payroll_entries pe
		JOIN public.employees e ON e.id = pe.employee_id
		LEFT JOIN public.profiles p ON p.id = e.profile_id
		WHERE pe.payroll_period_id = $1 AND pe.tenant_id = $2
		ORDER BY pe.employee_id`
	rows, err := h.pool.Query(r.Context(), q, periodID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải bảng lương.")
		return
	}
	defer rows.Close()

	// pe.* expands to many columns — return raw JSON objects per row by
	// reflecting the FieldDescriptions. This avoids hand-maintaining ~30
	// payroll columns in two places (the SELECT list and a struct).
	out := make([]map[string]any, 0)
	fields := rows.FieldDescriptions()
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to scan payroll entry")
			return
		}
		row := make(map[string]any, len(fields))
		for i, fd := range fields {
			row[string(fd.Name)] = vals[i]
		}
		out = append(out, row)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"entries": out})
}

func (h *Handler) approvePayroll(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || periodID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid period id")
		return
	}
	const q = `UPDATE public.payroll_periods
		SET status = 'approved', approved_by = $1::uuid, approved_at = now()
		WHERE id = $2 AND tenant_id = $3 AND status = 'calculated'
		RETURNING id`
	var updated int64
	err = h.pool.QueryRow(r.Context(), q, claims.UserUUID, periodID, claims.TenantID).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusConflict, "Không thể duyệt bảng lương.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể duyệt bảng lương.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) markPayrollPaid(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	periodID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || periodID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid period id")
		return
	}
	const q = `UPDATE public.payroll_periods
		SET status = 'paid', paid_at = now()
		WHERE id = $1 AND tenant_id = $2 AND status = 'approved'
		RETURNING id`
	var updated int64
	err = h.pool.QueryRow(r.Context(), q, periodID, claims.TenantID).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusConflict, "Không thể đánh dấu đã thanh toán.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể đánh dấu đã thanh toán.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── deferred payroll-compute endpoints ─────────────────────────────────────

// notImplementedPayrollCalc, notImplementedPayrollSummary and
// notImplementedInsuranceSummary are placeholders. The Node implementations
// depend on packages/shared/src/payroll/calculate.ts (357 LOC of Vietnamese
// PIT bracket calc + BHXH/BHYT/BHTN rate logic) which has not been ported to
// Go yet. Tracked as a follow-up — port the calc lib, then replace these
// stubs with real handlers.
func (h *Handler) notImplementedPayrollCalc(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Phiên bản tính lương Go chưa hoàn thành — đang chờ port lib packages/shared/src/payroll. Sử dụng frontend cũ để tính lương.")
}

func (h *Handler) notImplementedPayrollSummary(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Báo cáo tổng hợp lương theo năm chưa được port. Sử dụng frontend cũ.")
}

func (h *Handler) notImplementedInsuranceSummary(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Báo cáo bảo hiểm tháng chưa được port. Sử dụng frontend cũ.")
}

// ─── misc helpers ───────────────────────────────────────────────────────────

// nullStr returns nil for a NULL sql.NullString, otherwise the string value.
func nullStr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	return &v.String
}

// monthBoundaries returns the YYYY-MM-01 and YYYY-MM-<last> date strings.
func monthBoundaries(month string) (string, string, error) {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return "", "", err
	}
	first := t.Format("2006-01-02")
	last := t.AddDate(0, 1, -1).Format("2006-01-02")
	return first, last, nil
}

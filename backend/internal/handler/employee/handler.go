// Package employee serves self-service endpoints any authenticated employee
// can call on their own record: clock in/out, schedule, dependents update,
// shift requests.
//
// Ports the Node server actions under apps/web/app/employee/*.
//
// All routes are mounted at /employee and gated by RequireModule(ModuleEmployee)
// (allows all roles). Per-row authorization is enforced inside the RPCs via
// auth.uid() — every RPC call therefore runs inside db.WithAuthContext so
// the JWT sub claim is set on the pg session.
package employee

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// maxDistanceMeters is the GPS radius an employee must be inside to clock in.
// Matches MAX_DISTANCE_METERS in apps/web/app/employee/clock/actions.ts.
const maxDistanceMeters = 200.0

// vnLocation is the IANA timezone used for date arithmetic. Attendance is
// keyed on the local calendar day, not UTC.
var vnLocation = mustLoadVN()

func mustLoadVN() *time.Location {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		// Should never fail — Asia/Ho_Chi_Minh is a stable zone in tzdata.
		// Fall back to a fixed +07:00 offset rather than panicking at startup.
		return time.FixedZone("ICT", 7*60*60)
	}
	return loc
}

// Handler serves /employee/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for future fine-grained gates
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns the chi.Router mounted at /employee.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/clock/status", h.clockStatus)
	r.Post("/clock/in", h.clockIn)
	r.Post("/clock/out", h.clockOut)
	r.Get("/schedule", h.schedule)
	r.Put("/profile/dependents", h.updateDependents)
	r.Get("/shifts", h.listShifts)
	r.Post("/shift-requests", h.submitShiftRequest)
	r.Delete("/shift-requests/{id}", h.cancelShiftRequest)
	return r
}

// ─── helpers ────────────────────────────────────────────────────────────────

// todayVN returns today's local date in Asia/Ho_Chi_Minh as YYYY-MM-DD.
func todayVN() string {
	return time.Now().In(vnLocation).Format("2006-01-02")
}

// computeDailyCode returns the first 6 hex chars of HMAC-SHA256(secret, date).
// Mirrors computeDailyCode in apps/web/app/employee/clock/actions.ts.
func computeDailyCode(secret, date string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(date))
	return hex.EncodeToString(mac.Sum(nil))[:6]
}

// haversineMeters returns the great-circle distance between two lat/lng pairs
// in metres. Mirrors haversineMeters in apps/web/app/employee/clock/actions.ts.
func haversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadius = 6_371_000.0
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// lookupEmployeeID resolves the caller's employees.id (active row in this
// tenant) from their JWT sub. Returns (0, false, nil) when no active employee
// row exists — handlers should reply 422 (account not linked).
func (h *Handler) lookupEmployeeID(ctx *http.Request, tenantID int64, userUUID string) (int64, bool, error) {
	var empID int64
	err := h.pool.QueryRow(ctx.Context(),
		`SELECT id FROM public.employees
		 WHERE profile_id = $1::uuid AND tenant_id = $2 AND is_active = true
		 LIMIT 1`,
		userUUID, tenantID,
	).Scan(&empID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return empID, true, nil
}

// mapRPCError maps a SQLSTATE returned by one of the employee-self-service RPCs
// to an HTTP status + a Vietnamese user-facing message. Mirrors the
// per-message branches in the Node actions. Falls back to 500 on unknown codes.
func mapRPCError(err error, fallbackMsg string) (status int, msg string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		// Match on the SQLSTATE code first, then on the human message text the
		// RPC raises (the Node code matches on substrings of the message).
		switch pgErr.Code {
		case "23505": // unique_violation — submit_shift_request: "already assigned"
			return http.StatusConflict, "Bạn đã đăng ký ca này — chờ duyệt."
		case "42501", "28000": // insufficient_privilege / not_authenticated
			switch {
			case strings.Contains(pgErr.Message, "missing permission"):
				return http.StatusForbidden, "Không có quyền đăng ký ca."
			case strings.Contains(pgErr.Message, "no active employee"):
				return http.StatusUnprocessableEntity, "Tài khoản chưa được liên kết với hồ sơ nhân viên."
			case strings.Contains(pgErr.Message, "not the request owner"):
				return http.StatusForbidden, "Bạn không phải chủ đăng ký này."
			case strings.Contains(pgErr.Message, "missing auth context"):
				return http.StatusUnauthorized, "Chưa đăng nhập"
			default:
				return http.StatusForbidden, fallbackMsg
			}
		case "23503": // foreign_key_violation — shift not found
			return http.StatusUnprocessableEntity, "Ca không tồn tại hoặc đã bị tắt."
		case "P0002": // no_data_found
			if strings.Contains(pgErr.Message, "no active employee record") {
				return http.StatusUnprocessableEntity, "Tài khoản chưa được liên kết hồ sơ nhân viên đang hoạt động."
			}
			return http.StatusNotFound, "Không tìm thấy đăng ký."
		case "23514", "P0001": // check_violation or RAISE without specific code
			switch {
			case strings.Contains(pgErr.Message, "past date"):
				return http.StatusUnprocessableEntity, "Không thể đăng ký cho ngày đã qua."
			case strings.Contains(pgErr.Message, "invalid count"):
				return http.StatusUnprocessableEntity, "Số người phụ thuộc phải từ 0 đến 20"
			case strings.Contains(pgErr.Message, "not pending"):
				return http.StatusConflict, "Đăng ký không còn ở trạng thái chờ duyệt."
			default:
				return http.StatusUnprocessableEntity, fallbackMsg
			}
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

// ─── /clock/status ──────────────────────────────────────────────────────────

type clockStatusResponse struct {
	ClockedIn    bool    `json:"clocked_in"`
	CheckInTime  *string `json:"check_in_time"`
	CheckOutTime *string `json:"check_out_time"`
	BranchName   *string `json:"branch_name"`
}

func (h *Handler) clockStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	empID, found, err := h.lookupEmployeeID(r, claims.TenantID, claims.UserUUID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load employee")
		return
	}
	if !found {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.")
		return
	}

	const q = `
		SELECT a.check_in, a.check_out, b.name
		FROM public.attendance_records a
		LEFT JOIN public.branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
		WHERE a.employee_id = $1 AND a.tenant_id = $2 AND a.date = $3
		LIMIT 1`
	var checkIn, checkOut sql.NullTime
	var branchName sql.NullString
	row := h.pool.QueryRow(r.Context(), q, empID, claims.TenantID, todayVN())
	if err := row.Scan(&checkIn, &checkOut, &branchName); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteJSON(w, http.StatusOK, clockStatusResponse{ClockedIn: false})
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load attendance")
		return
	}

	resp := clockStatusResponse{ClockedIn: checkIn.Valid && !checkOut.Valid}
	if checkIn.Valid {
		s := checkIn.Time.Format(time.RFC3339)
		resp.CheckInTime = &s
	}
	if checkOut.Valid {
		s := checkOut.Time.Format(time.RFC3339)
		resp.CheckOutTime = &s
	}
	if branchName.Valid {
		resp.BranchName = &branchName.String
	}
	httputil.WriteJSON(w, http.StatusOK, resp)
}

// ─── /clock/in ──────────────────────────────────────────────────────────────

type clockInRequest struct {
	BranchID int64   `json:"branch_id"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	Code     string  `json:"code"`
}

var dailyCodePattern = regexp.MustCompile(`^[0-9a-fA-F]{6}$`)

func (h *Handler) clockIn(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req clockInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		httputil.WriteError(w, http.StatusBadRequest, "lat/lng out of range")
		return
	}
	if !dailyCodePattern.MatchString(req.Code) {
		httputil.WriteError(w, http.StatusBadRequest, "Mã chấm công không hợp lệ")
		return
	}

	empID, found, err := h.lookupEmployeeID(r, claims.TenantID, claims.UserUUID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load employee")
		return
	}
	if !found {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.")
		return
	}

	today := todayVN()

	// Duplicate-clockin guard (Node: existing && !check_out → "đã chấm công vào").
	var existingCheckOut sql.NullTime
	var existsAny bool
	{
		err := h.pool.QueryRow(r.Context(),
			`SELECT check_out FROM public.attendance_records
			 WHERE employee_id = $1 AND tenant_id = $2 AND date = $3
			 LIMIT 1`,
			empID, claims.TenantID, today,
		).Scan(&existingCheckOut)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			// fall through — first clockin of the day
		case err != nil:
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read attendance")
			return
		default:
			existsAny = true
		}
	}
	if existsAny {
		if !existingCheckOut.Valid {
			httputil.WriteError(w, http.StatusConflict, "Bạn đã chấm công vào hôm nay rồi")
			return
		}
		httputil.WriteError(w, http.StatusConflict, "Bạn đã chấm công vào và ra hôm nay rồi")
		return
	}

	// Branch GPS coordinates.
	var branchLat, branchLng sql.NullFloat64
	if err := h.pool.QueryRow(r.Context(),
		`SELECT latitude, longitude FROM public.branches
		 WHERE id = $1 AND tenant_id = $2`,
		req.BranchID, claims.TenantID,
	).Scan(&branchLat, &branchLng); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "Chi nhánh không tồn tại")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load branch")
		return
	}
	if !branchLat.Valid || !branchLng.Valid {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Chi nhánh chưa cài đặt tọa độ GPS. Liên hệ quản lý.")
		return
	}
	distance := haversineMeters(req.Lat, req.Lng, branchLat.Float64, branchLng.Float64)
	if distance > maxDistanceMeters {
		httputil.WriteError(w, http.StatusUnprocessableEntity,
			"Bạn đang ở quá xa chi nhánh ("+strconv.Itoa(int(math.Round(distance)))+
				"m). Phải ở trong phạm vi "+strconv.Itoa(int(maxDistanceMeters))+"m.")
		return
	}

	// Validate daily code against branch_attendance_config.attendance_secret.
	var secret string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT attendance_secret FROM public.branch_attendance_config
		 WHERE branch_id = $1 AND tenant_id = $2`,
		req.BranchID, claims.TenantID,
	).Scan(&secret); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "Chi nhánh chưa cài đặt mã chấm công. Liên hệ quản lý.")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load attendance config")
		return
	}
	if !hmac.Equal([]byte(computeDailyCode(secret, today)), []byte(strings.ToLower(req.Code))) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Mã chấm công không đúng")
		return
	}

	// Insert the attendance row. Pool role bypasses RLS so the row lands even
	// without a JWT context. Tenant/employee scoping is enforced by the
	// explicit parameters above.
	const insertQ = `INSERT INTO public.attendance_records
		(tenant_id, branch_id, employee_id, date, check_in, status, lat, lng, method, code_verified)
		VALUES ($1, $2, $3, $4, now(), 'present', $5, $6, 'pwa', true)
		RETURNING check_in`
	var checkInTime time.Time
	if err := h.pool.QueryRow(r.Context(), insertQ,
		claims.TenantID, req.BranchID, empID, today, req.Lat, req.Lng,
	).Scan(&checkInTime); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm công. Vui lòng thử lại.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"check_in_time": checkInTime.Format(time.RFC3339),
	})
}

// ─── /clock/out ─────────────────────────────────────────────────────────────

func (h *Handler) clockOut(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	empID, found, err := h.lookupEmployeeID(r, claims.TenantID, claims.UserUUID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load employee")
		return
	}
	if !found {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.")
		return
	}

	today := todayVN()
	const updateQ = `UPDATE public.attendance_records
		SET check_out = now()
		WHERE employee_id = $1 AND tenant_id = $2 AND date = $3 AND check_out IS NULL
		RETURNING check_out`
	var checkOutTime time.Time
	err = h.pool.QueryRow(r.Context(), updateQ, empID, claims.TenantID, today).Scan(&checkOutTime)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy bản ghi chấm công vào hôm nay")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chấm công ra. Vui lòng thử lại.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"check_out_time": checkOutTime.Format(time.RFC3339),
	})
}

// ─── /schedule ──────────────────────────────────────────────────────────────

type scheduleShift struct {
	Date      string `json:"date"`
	ShiftName string `json:"shift_name"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

var weekStartPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func (h *Handler) schedule(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	weekStart := r.URL.Query().Get("week_start")
	if !weekStartPattern.MatchString(weekStart) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}
	start, err := time.ParseInLocation("2006-01-02", weekStart, vnLocation)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ")
		return
	}
	weekEnd := start.AddDate(0, 0, 6).Format("2006-01-02")

	empID, found, err := h.lookupEmployeeID(r, claims.TenantID, claims.UserUUID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to load employee")
		return
	}
	if !found {
		httputil.WriteError(w, http.StatusNotFound, "Không tìm thấy hồ sơ nhân viên")
		return
	}

	const q = `
		SELECT sa.date, s.name, s.start_time, s.end_time
		FROM public.shift_assignments sa
		JOIN public.shifts s
		  ON s.id = sa.shift_id AND s.tenant_id = sa.tenant_id
		WHERE sa.employee_id = $1
		  AND sa.tenant_id   = $2
		  AND sa.date BETWEEN $3 AND $4
		ORDER BY sa.date ASC`
	rows, err := h.pool.Query(r.Context(), q, empID, claims.TenantID, weekStart, weekEnd)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được lịch ca.")
		return
	}
	defer rows.Close()

	shifts := make([]scheduleShift, 0)
	for rows.Next() {
		var date time.Time
		var name string
		var st, et time.Time
		if err := rows.Scan(&date, &name, &st, &et); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read shift")
			return
		}
		shifts = append(shifts, scheduleShift{
			Date:      date.Format("2006-01-02"),
			ShiftName: name,
			StartTime: st.Format("15:04"),
			EndTime:   et.Format("15:04"),
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"shifts": shifts})
}

// ─── /profile/dependents ────────────────────────────────────────────────────

type updateDependentsRequest struct {
	Count int `json:"count"`
}

func (h *Handler) updateDependents(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req updateDependentsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Count < 0 || req.Count > 20 {
		httputil.WriteError(w, http.StatusBadRequest, "Số người phụ thuộc phải từ 0 đến 20")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.update_my_dependents_count($1)`, req.Count)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể cập nhật. Vui lòng thử lại.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── /shifts (registerable shifts for a branch) ─────────────────────────────

type registerableShift struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

func (h *Handler) listShifts(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := strconv.ParseInt(r.URL.Query().Get("branch_id"), 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id is required")
		return
	}
	const q = `SELECT id, name, start_time, end_time
		FROM public.shifts
		WHERE tenant_id = $1 AND branch_id = $2 AND is_active = true
		ORDER BY start_time`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải ca làm.")
		return
	}
	defer rows.Close()
	out := make([]registerableShift, 0)
	for rows.Next() {
		var s registerableShift
		var st, et time.Time
		if err := rows.Scan(&s.ID, &s.Name, &st, &et); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read shift")
			return
		}
		s.StartTime = st.Format("15:04")
		s.EndTime = et.Format("15:04")
		out = append(out, s)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"shifts": out})
}

// ─── /shift-requests ────────────────────────────────────────────────────────

type submitShiftRequestBody struct {
	BranchID int64  `json:"branch_id"`
	ShiftID  int64  `json:"shift_id"`
	Date     string `json:"date"`
	Note     string `json:"note"`
}

func (h *Handler) submitShiftRequest(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req submitShiftRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BranchID <= 0 || req.ShiftID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id and shift_id are required")
		return
	}
	if !weekStartPattern.MatchString(req.Date) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ")
		return
	}
	if len(req.Note) > 500 {
		httputil.WriteError(w, http.StatusBadRequest, "Ghi chú quá dài (tối đa 500 ký tự)")
		return
	}

	var note any
	if req.Note != "" {
		note = req.Note
	}

	var requestID int64
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.submit_shift_request($1, $2, $3::date, $4)`,
			req.BranchID, req.ShiftID, req.Date, note,
		).Scan(&requestID)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể đăng ký ca.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"request_id": requestID})
}

func (h *Handler) cancelShiftRequest(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	requestID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || requestID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request id")
		return
	}
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.cancel_shift_request($1)`, requestID)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể huỷ đăng ký.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

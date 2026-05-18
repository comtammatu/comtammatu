// Package feedback serves the customer feedback endpoints.
//
// Public surface (no auth required):
//   - POST /r/{token}/submit  — customer submits feedback via QR scan
//   - POST /r/{token}/photos  — photo upload (deferred; returns 501)
//
// Admin surface (gated by Authenticate + RequireModule(ModuleFeedback)):
//   - GET  /admin/feedback/              — list feedbacks, bulk mark suspect
//   - POST /admin/feedback/suspect       — bulk mark suspect
//   - POST /admin/feedback/reports/trigger — trigger daily report now
//   - GET  /admin/feedback/qr           — list QR codes
//   - POST /admin/feedback/qr           — create QR code
//   - PUT  /admin/feedback/qr/{id}/label  — update label
//   - PUT  /admin/feedback/qr/{id}/toggle — toggle active
//   - POST /admin/feedback/qr/{id}/rotate — rotate token
//   - GET  /admin/feedback/settings     — get settings
//   - PUT  /admin/feedback/settings     — update settings
//   - GET  /admin/feedback/settings/telegram        — list telegram destinations
//   - POST /admin/feedback/settings/telegram        — create telegram destination
//   - PUT  /admin/feedback/settings/telegram/{id}/toggle — toggle telegram destination
//   - DELETE /admin/feedback/settings/telegram/{id} — delete telegram destination
//   - POST /admin/feedback/settings/telegram/{id}/test — send test message
//
// Ports the Node server actions under:
//
//	apps/web/app/r/[token]/actions.ts
//	apps/web/app/admin/feedback/actions.ts
//	apps/web/app/admin/feedback/reports/actions.ts
//	apps/web/app/admin/feedback/qr/actions.ts
//	apps/web/app/admin/feedback/settings/actions.ts
package feedback

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves /r/{token}/* (public) and /admin/feedback/* (admin) routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for future fine-grained gates
}

// New constructs a Handler.
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// PublicRoutes returns routes that must be mounted OUTSIDE the Authenticate group.
// Mount at / (root) so the token path matches /r/{token}/submit.
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/r/{token}/submit", h.submitFeedback)
	r.Post("/r/{token}/photos", h.photosNotImplemented)
	return r
}

// AdminRoutes returns routes that must be mounted INSIDE the authenticated + RequireModule group.
// Caller mounts at /admin/feedback.
func (h *Handler) AdminRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.listFeedback)
	r.Post("/suspect", h.bulkMarkSuspect)
	r.Post("/reports/trigger", h.triggerDailyReport)
	r.Get("/qr", h.listQRCodes)
	r.Post("/qr", h.createQRCode)
	r.Put("/qr/{id}/label", h.updateQRLabel)
	r.Put("/qr/{id}/toggle", h.toggleQRCode)
	r.Post("/qr/{id}/rotate", h.rotateQRCode)
	r.Get("/settings", h.getSettings)
	r.Put("/settings", h.updateSettings)
	r.Get("/settings/telegram", h.listTelegramDestinations)
	r.Post("/settings/telegram", h.createTelegramDestination)
	r.Put("/settings/telegram/{id}/toggle", h.toggleTelegramDestination)
	r.Delete("/settings/telegram/{id}", h.deleteTelegramDestination)
	r.Post("/settings/telegram/{id}/test", h.testTelegramDestination)
	return r
}

// ─── helpers ────────────────────────────────────────────────────────────────

// mapRPCError maps known SQLSTATE codes from feedback RPCs to HTTP status +
// Vietnamese user-facing message. Mirrors the error branches in the Node actions.
func mapRPCError(err error, fallbackMsg string) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "P0002": // no_data_found — token_not_found_or_inactive
			if strings.Contains(pgErr.Message, "token_not_found_or_inactive") {
				return http.StatusNotFound, "QR không hợp lệ hoặc đã bị vô hiệu hóa."
			}
			return http.StatusNotFound, fallbackMsg
		case "23514": // check_violation — rating, comment length, phone format
			return http.StatusUnprocessableEntity, fallbackMsg
		case "23505": // unique_violation
			return http.StatusConflict, fallbackMsg
		case "42501", "28000": // insufficient_privilege
			return http.StatusForbidden, "Không có quyền thực hiện thao tác này."
		case "P0001": // RAISE EXCEPTION generic
			return http.StatusUnprocessableEntity, fallbackMsg
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

func parseID(r *http.Request, param string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, param), 10, 64)
	return id, err == nil && id > 0
}

// ─── Public: POST /r/{token}/submit ─────────────────────────────────────────

type submitFeedbackRequest struct {
	Rating         int16  `json:"rating"`
	Comment        string `json:"comment"`
	Phone          string `json:"phone"`
	Website        string `json:"website"` // honeypot
	UserAgentShort string `json:"user_agent_short"`
}

func (h *Handler) submitFeedback(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		httputil.WriteError(w, http.StatusBadRequest, "token là bắt buộc")
		return
	}

	var req submitFeedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}

	// Honeypot check — return fake success, do NOT insert.
	if req.Website != "" {
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"feedback_id": 0})
		return
	}

	if req.Rating < 1 || req.Rating > 5 {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}

	// The RPC is SECURITY DEFINER granted to service_role only. The Go pool
	// connects as service_role (superuser-equivalent) so it can call this
	// without any auth context. auth.uid() is NOT used inside submit_feedback.
	var feedbackID int64
	var phone *string
	if req.Phone != "" {
		phone = &req.Phone
	}
	var ua *string
	if req.UserAgentShort != "" {
		s := req.UserAgentShort
		if len(s) > 200 {
			s = s[:200]
		}
		ua = &s
	}

	err := h.pool.QueryRow(r.Context(),
		`SELECT public.submit_feedback($1, $2::SMALLINT, $3, $4, '{}', NULL, $5)`,
		token, req.Rating, req.Comment, phone, ua,
	).Scan(&feedbackID)
	if err != nil {
		status, msg := mapRPCError(err, "Có lỗi xảy ra, vui lòng thử lại.")
		httputil.WriteError(w, status, msg)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{"feedback_id": feedbackID})
}

// ─── Public: POST /r/{token}/photos ─────────────────────────────────────────

func (h *Handler) photosNotImplemented(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Tính năng tải ảnh chưa được hỗ trợ trên Go backend — R2 storage chưa tích hợp.")
}

// ─── Admin: GET /admin/feedback/ ────────────────────────────────────────────

type feedbackRow struct {
	ID         int64          `json:"id"`
	BranchID   int64          `json:"branch_id"`
	Rating     int16          `json:"rating"`
	Comment    sql.NullString `json:"-"`
	CommentOut *string        `json:"comment"`
	Phone      sql.NullString `json:"-"`
	PhoneOut   *string        `json:"phone"`
	Channel    string         `json:"channel"`
	IsSuspect  bool           `json:"is_suspect"`
	CreatedAt  time.Time      `json:"created_at"`
}

func (h *Handler) listFeedback(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Optional filters
	q := r.URL.Query()
	branchIDStr := q.Get("branch_id")
	ratingStr := q.Get("rating")
	isSuspectStr := q.Get("is_suspect")
	limitStr := q.Get("limit")
	offsetStr := q.Get("offset")

	limit := int64(50)
	if v, err := strconv.ParseInt(limitStr, 10, 64); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	offset := int64(0)
	if v, err := strconv.ParseInt(offsetStr, 10, 64); err == nil && v >= 0 {
		offset = v
	}

	args := []any{claims.TenantID, limit, offset}
	where := []string{"tenant_id = $1"}
	idx := 4

	if branchIDStr != "" {
		if bid, err := strconv.ParseInt(branchIDStr, 10, 64); err == nil && bid > 0 {
			where = append(where, "branch_id = $"+strconv.Itoa(idx))
			args = append(args, bid)
			idx++
		}
	}
	if ratingStr != "" {
		if rv, err := strconv.ParseInt(ratingStr, 10, 64); err == nil && rv >= 1 && rv <= 5 {
			where = append(where, "rating = $"+strconv.Itoa(idx))
			args = append(args, int16(rv))
			idx++
		}
	}
	if isSuspectStr != "" {
		isSuspect := isSuspectStr == "true"
		where = append(where, "is_suspect = $"+strconv.Itoa(idx))
		args = append(args, isSuspect)
		// idx++ — not needed after last
	}

	whereClause := strings.Join(where, " AND ")
	query := `SELECT id, branch_id, rating, comment, phone, channel, is_suspect, created_at
		FROM public.feedbacks
		WHERE ` + whereClause + `
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách phản ánh.")
		return
	}
	defer rows.Close()

	type outRow struct {
		ID        int64   `json:"id"`
		BranchID  int64   `json:"branch_id"`
		Rating    int16   `json:"rating"`
		Comment   *string `json:"comment"`
		Phone     *string `json:"phone"`
		Channel   string  `json:"channel"`
		IsSuspect bool    `json:"is_suspect"`
		CreatedAt string  `json:"created_at"`
	}
	out := make([]outRow, 0)
	for rows.Next() {
		var row feedbackRow
		if err := rows.Scan(&row.ID, &row.BranchID, &row.Rating, &row.Comment, &row.Phone, &row.Channel, &row.IsSuspect, &row.CreatedAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read feedback")
			return
		}
		r2 := outRow{
			ID:        row.ID,
			BranchID:  row.BranchID,
			Rating:    row.Rating,
			Channel:   row.Channel,
			IsSuspect: row.IsSuspect,
			CreatedAt: row.CreatedAt.Format(time.RFC3339),
		}
		if row.Comment.Valid {
			r2.Comment = &row.Comment.String
		}
		if row.Phone.Valid {
			r2.Phone = &row.Phone.String
		}
		out = append(out, r2)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"feedbacks": out})
}

// ─── Admin: POST /admin/feedback/suspect ────────────────────────────────────

type bulkMarkSuspectRequest struct {
	FeedbackIDs []int64 `json:"feedback_ids"`
	IsSuspect   bool    `json:"is_suspect"`
}

func (h *Handler) bulkMarkSuspect(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req bulkMarkSuspectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}
	if len(req.FeedbackIDs) == 0 || len(req.FeedbackIDs) > 100 {
		httputil.WriteError(w, http.StatusBadRequest, "feedback_ids phải có từ 1 đến 100 phần tử")
		return
	}

	var updated int
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.bulk_mark_feedback_suspect($1, $2)`,
		req.FeedbackIDs, req.IsSuspect,
	).Scan(&updated)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật trạng thái.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"updated": updated})
}

// ─── Admin: POST /admin/feedback/reports/trigger ────────────────────────────

func (h *Handler) triggerDailyReport(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}
	// The daily report is generated by a cron worker; this endpoint triggers it.
	// Direct DB invocation: call the feedback_daily_report RPC for today.
	today := time.Now().Format("2006-01-02")
	var reportsGenerated int
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.generate_daily_feedback_report($1::date)`,
		today,
	).Scan(&reportsGenerated)
	if err != nil {
		// RPC may not exist yet — return best-effort
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chạy báo cáo ngay lúc này.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"report_date":       today,
		"reports_generated": reportsGenerated,
	})
}

// ─── Admin: GET /admin/feedback/qr ──────────────────────────────────────────

func (h *Handler) listQRCodes(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, branch_id, table_id, token, label, is_active, rotated_at, created_at
		FROM public.feedback_qr_codes
		WHERE tenant_id = $1
		ORDER BY created_at DESC`,
		claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách QR.")
		return
	}
	defer rows.Close()

	type qrRow struct {
		ID        int64   `json:"id"`
		BranchID  int64   `json:"branch_id"`
		TableID   *int64  `json:"table_id"`
		Token     string  `json:"token"`
		Label     string  `json:"label"`
		IsActive  bool    `json:"is_active"`
		RotatedAt *string `json:"rotated_at"`
		CreatedAt string  `json:"created_at"`
	}
	out := make([]qrRow, 0)
	for rows.Next() {
		var row qrRow
		var tableID sql.NullInt64
		var rotatedAt sql.NullTime
		var createdAt time.Time
		if err := rows.Scan(&row.ID, &row.BranchID, &tableID, &row.Token, &row.Label, &row.IsActive, &rotatedAt, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read qr code")
			return
		}
		if tableID.Valid {
			row.TableID = &tableID.Int64
		}
		if rotatedAt.Valid {
			s := rotatedAt.Time.Format(time.RFC3339)
			row.RotatedAt = &s
		}
		row.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, row)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"qr_codes": out})
}

// ─── Admin: POST /admin/feedback/qr ─────────────────────────────────────────

type createQRRequest struct {
	BranchID int64  `json:"branch_id"`
	TableID  *int64 `json:"table_id"`
	Label    string `json:"label"`
}

func (h *Handler) createQRCode(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	var req createQRRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}
	if req.BranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id là bắt buộc")
		return
	}
	if req.Label == "" {
		httputil.WriteError(w, http.StatusBadRequest, "label là bắt buộc")
		return
	}

	// Verify branch belongs to tenant
	var branchExists bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM public.branches WHERE id = $1 AND tenant_id = $2)`,
		req.BranchID, claims.TenantID,
	).Scan(&branchExists)
	if err != nil || !branchExists {
		httputil.WriteError(w, http.StatusBadRequest, "Chi nhánh không hợp lệ")
		return
	}

	// Generate a unique token (uuid-based, collision-resistant)
	var token string
	err = h.pool.QueryRow(r.Context(), `SELECT encode(gen_random_bytes(16), 'hex')`).Scan(&token)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo token.")
		return
	}

	var id int64
	insertErr := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.feedback_qr_codes (tenant_id, branch_id, table_id, token, label)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		claims.TenantID, req.BranchID, req.TableID, token, req.Label,
	).Scan(&id)
	if insertErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo QR. Vui lòng thử lại.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id, "token": token})
}

// ─── Admin: PUT /admin/feedback/qr/{id}/label ───────────────────────────────

type updateLabelRequest struct {
	Label string `json:"label"`
}

func (h *Handler) updateQRLabel(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var req updateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Label == "" {
		httputil.WriteError(w, http.StatusBadRequest, "label là bắt buộc")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE public.feedback_qr_codes SET label = $1 WHERE id = $2 AND tenant_id = $3`,
		req.Label, id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật nhãn.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Admin: PUT /admin/feedback/qr/{id}/toggle ──────────────────────────────

type toggleQRRequest struct {
	IsActive bool `json:"is_active"`
}

func (h *Handler) toggleQRCode(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var req toggleQRRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE public.feedback_qr_codes SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
		req.IsActive, id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật trạng thái QR.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Admin: POST /admin/feedback/qr/{id}/rotate ─────────────────────────────

func (h *Handler) rotateQRCode(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	// Generate new token, retry up to 3 times to avoid collision.
	var newToken string
	for attempt := 0; attempt < 3; attempt++ {
		var candidate string
		if err := h.pool.QueryRow(r.Context(), `SELECT encode(gen_random_bytes(16), 'hex')`).Scan(&candidate); err != nil {
			break
		}
		var exists bool
		if err := h.pool.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM public.feedback_qr_codes WHERE token = $1)`,
			candidate,
		).Scan(&exists); err != nil || exists {
			continue
		}
		newToken = candidate
		break
	}
	if newToken == "" {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xoay token. Vui lòng thử lại.")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE public.feedback_qr_codes
		SET token = $1, rotated_at = now(), is_active = true
		WHERE id = $2 AND tenant_id = $3`,
		newToken, id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xoay token.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"token": newToken})
}

// ─── Admin: GET /admin/feedback/settings ────────────────────────────────────

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	type settingsRow struct {
		TenantID             int64   `json:"tenant_id"`
		AiMonthlyBudgetUSD   float64 `json:"ai_monthly_budget_usd"`
		PushMode             string  `json:"push_mode"`
		ThresholdRating      int16   `json:"threshold_rating"`
		DailyReportHourLocal int16   `json:"daily_report_hour_local"`
		UpdatedAt            string  `json:"updated_at"`
		UpdatedBy            *string `json:"updated_by"`
	}

	var s settingsRow
	var updatedAt time.Time
	var updatedBy sql.NullString
	err := h.pool.QueryRow(r.Context(),
		`SELECT tenant_id, ai_monthly_budget_usd, push_mode, threshold_rating,
		        daily_report_hour_local, updated_at, updated_by
		FROM public.feedback_settings
		WHERE tenant_id = $1`,
		claims.TenantID,
	).Scan(&s.TenantID, &s.AiMonthlyBudgetUSD, &s.PushMode, &s.ThresholdRating,
		&s.DailyReportHourLocal, &updatedAt, &updatedBy)

	if errors.Is(err, pgx.ErrNoRows) {
		// Return defaults matching the Node action
		s = settingsRow{
			TenantID:             claims.TenantID,
			AiMonthlyBudgetUSD:   5,
			PushMode:             "threshold",
			ThresholdRating:      3,
			DailyReportHourLocal: 8,
			UpdatedAt:            time.Now().Format(time.RFC3339),
		}
		httputil.WriteJSON(w, http.StatusOK, s)
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải cài đặt.")
		return
	}
	s.UpdatedAt = updatedAt.Format(time.RFC3339)
	if updatedBy.Valid {
		s.UpdatedBy = &updatedBy.String
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

// ─── Admin: PUT /admin/feedback/settings ────────────────────────────────────

type updateSettingsRequest struct {
	AiMonthlyBudgetUSD   *float64 `json:"ai_monthly_budget_usd"`
	PushMode             *string  `json:"push_mode"`
	ThresholdRating      *int16   `json:"threshold_rating"`
	DailyReportHourLocal *int16   `json:"daily_report_hour_local"`
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	var req updateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`INSERT INTO public.feedback_settings
		 (tenant_id, ai_monthly_budget_usd, push_mode, threshold_rating, daily_report_hour_local, updated_at, updated_by)
		 VALUES ($1,
		   COALESCE($2, 5),
		   COALESCE($3, 'threshold'),
		   COALESCE($4, 3),
		   COALESCE($5, 8),
		   now(), $6)
		 ON CONFLICT (tenant_id) DO UPDATE SET
		   ai_monthly_budget_usd  = COALESCE($2, feedback_settings.ai_monthly_budget_usd),
		   push_mode              = COALESCE($3, feedback_settings.push_mode),
		   threshold_rating       = COALESCE($4, feedback_settings.threshold_rating),
		   daily_report_hour_local = COALESCE($5, feedback_settings.daily_report_hour_local),
		   updated_at = now(),
		   updated_by = $6`,
		claims.TenantID, req.AiMonthlyBudgetUSD, req.PushMode, req.ThresholdRating,
		req.DailyReportHourLocal, claims.UserUUID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể lưu cài đặt.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Admin: GET /admin/feedback/settings/telegram ───────────────────────────

func (h *Handler) listTelegramDestinations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, branch_id, chat_id, label, is_active, created_at
		FROM public.telegram_destinations
		WHERE tenant_id = $1
		ORDER BY created_at DESC`,
		claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách Telegram.")
		return
	}
	defer rows.Close()

	type destRow struct {
		ID        int64  `json:"id"`
		BranchID  *int64 `json:"branch_id"`
		ChatID    string `json:"chat_id"`
		Label     string `json:"label"`
		IsActive  bool   `json:"is_active"`
		CreatedAt string `json:"created_at"`
	}
	out := make([]destRow, 0)
	for rows.Next() {
		var row destRow
		var branchID sql.NullInt64
		var createdAt time.Time
		if err := rows.Scan(&row.ID, &branchID, &row.ChatID, &row.Label, &row.IsActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read telegram destination")
			return
		}
		if branchID.Valid {
			row.BranchID = &branchID.Int64
		}
		row.CreatedAt = createdAt.Format(time.RFC3339)
		out = append(out, row)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"destinations": out})
}

// ─── Admin: POST /admin/feedback/settings/telegram ──────────────────────────

type createTelegramRequest struct {
	BranchID *int64 `json:"branch_id"`
	ChatID   string `json:"chat_id"`
	Label    string `json:"label"`
}

func (h *Handler) createTelegramDestination(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	var req createTelegramRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}
	if req.ChatID == "" || req.Label == "" {
		httputil.WriteError(w, http.StatusBadRequest, "chat_id và label là bắt buộc")
		return
	}

	var id int64
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.telegram_destinations (tenant_id, branch_id, chat_id, label)
		VALUES ($1, $2, $3, $4)
		RETURNING id`,
		claims.TenantID, req.BranchID, req.ChatID, req.Label,
	).Scan(&id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tạo destination.")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// ─── Admin: PUT /admin/feedback/settings/telegram/{id}/toggle ───────────────

type toggleTelegramRequest struct {
	IsActive bool `json:"is_active"`
}

func (h *Handler) toggleTelegramDestination(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	var req toggleTelegramRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Dữ liệu không hợp lệ")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`UPDATE public.telegram_destinations SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
		req.IsActive, id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể cập nhật trạng thái.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Admin: DELETE /admin/feedback/settings/telegram/{id} ───────────────────

func (h *Handler) deleteTelegramDestination(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`DELETE FROM public.telegram_destinations WHERE id = $1 AND tenant_id = $2`,
		id, claims.TenantID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể xoá destination.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Admin: POST /admin/feedback/settings/telegram/{id}/test ────────────────

func (h *Handler) testTelegramDestination(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if string(claims.UserRole) != "owner" {
		httputil.WriteError(w, http.StatusForbidden, "Không có quyền")
		return
	}

	id, ok := parseID(r, "id")
	if !ok {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ")
		return
	}

	// Verify destination belongs to tenant
	var chatID string
	err := h.pool.QueryRow(r.Context(),
		`SELECT chat_id FROM public.telegram_destinations WHERE id = $1 AND tenant_id = $2`,
		id, claims.TenantID,
	).Scan(&chatID)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "Destination không tồn tại.")
		return
	}
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải destination.")
		return
	}

	// The Telegram bot token lives in env — Go backend does not have access to it
	// unless configured. Return 501 indicating this feature requires bot token config.
	httputil.WriteError(w, http.StatusNotImplemented,
		"Gửi tin nhắn test chưa được hỗ trợ trực tiếp từ Go backend — cần cấu hình TELEGRAM_BOT_TOKEN.")
}

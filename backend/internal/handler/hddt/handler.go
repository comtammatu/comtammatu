// Package hddt serves the admin HĐĐT (Vietnamese e-invoice) endpoints
// mounted at /admin/hddt.
//
// Routes:
//
//	GET  /admin/hddt/summary-runs               — list summary_run_queue rows for tenant
//	POST /admin/hddt/summary-runs               — manual trigger for a branch
//	POST /admin/hddt/summary-runs/{id}/transition — call transition_tax_invoice_state RPC
package hddt

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/hddt"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves /admin/hddt/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for fine-grained permission gates
}

// New constructs a Handler.
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns the chi.Router to be mounted at /admin/hddt.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/summary-runs", h.listSummaryRuns)
	r.Post("/summary-runs", h.triggerSummaryRun)
	r.Post("/summary-runs/{id}/transition", h.transitionInvoiceState)
	return r
}

// ─── handlers ───────────────────────────────────────────────────────────────

// listSummaryRuns returns summary_run_queue rows for the authenticated tenant,
// ordered by created_at DESC, paginated via limit/offset query params.
func (h *Handler) listSummaryRuns(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Phiên đăng nhập hết hạn.")
		return
	}

	q := r.URL.Query()
	limit := 50
	offset := 0
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	rows, err := h.pool.Query(r.Context(), `
		SELECT id, tenant_id, branch_id, summary_date, status,
		       trigger_source, triggered_by, attempt_count,
		       last_error, tax_invoice_id, started_at, finished_at, created_at
		FROM public.summary_run_queue
		WHERE tenant_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`,
		claims.TenantID, limit, offset,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách summary runs.")
		return
	}
	defer rows.Close()

	type summaryRunRow struct {
		ID            int64   `json:"id"`
		TenantID      int64   `json:"tenant_id"`
		BranchID      int64   `json:"branch_id"`
		SummaryDate   string  `json:"summary_date"`
		Status        string  `json:"status"`
		TriggerSource string  `json:"trigger_source"`
		TriggeredBy   *string `json:"triggered_by"`
		AttemptCount  int     `json:"attempt_count"`
		LastError     *string `json:"last_error"`
		TaxInvoiceID  *int64  `json:"tax_invoice_id"`
		StartedAt     *string `json:"started_at"`
		FinishedAt    *string `json:"finished_at"`
		CreatedAt     string  `json:"created_at"`
	}

	result := make([]summaryRunRow, 0)
	for rows.Next() {
		var item summaryRunRow
		if err := rows.Scan(
			&item.ID, &item.TenantID, &item.BranchID, &item.SummaryDate,
			&item.Status, &item.TriggerSource, &item.TriggeredBy,
			&item.AttemptCount, &item.LastError, &item.TaxInvoiceID,
			&item.StartedAt, &item.FinishedAt, &item.CreatedAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "Lỗi đọc dữ liệu.")
			return
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách summary runs.")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, result)
}

// triggerSummaryRun manually kicks off the daily summary for a given branch.
// Body: { "branch_id": 123 }
func (h *Handler) triggerSummaryRun(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Phiên đăng nhập hết hạn.")
		return
	}

	var req struct {
		BranchID int64 `json:"branch_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.BranchID == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id là bắt buộc.")
		return
	}

	queueID, err := hddt.RunDailySummaryForBranch(r.Context(), h.pool, claims.TenantID, req.BranchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể chạy summary run.")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]any{
		"queue_id": queueID,
	})
}

// transitionInvoiceState calls transition_tax_invoice_state RPC for the
// tax invoice linked to a summary_run_queue row. The call is wrapped in
// WithAuthContext because the RPC calls auth.uid() internally (SECURITY DEFINER).
//
// URL param: {id} = summary_run_queue.id
// Body: { "to_status": "signing", "payload": {}, "note": "" }
func (h *Handler) transitionInvoiceState(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "Phiên đăng nhập hết hạn.")
		return
	}

	queueID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || queueID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ID không hợp lệ.")
		return
	}

	var req struct {
		ToStatus string          `json:"to_status"`
		Payload  json.RawMessage `json:"payload"`
		Note     *string         `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ToStatus == "" {
		httputil.WriteError(w, http.StatusBadRequest, "to_status là bắt buộc.")
		return
	}

	// Resolve tax_invoice_id from the queue row, scoped to tenant for security.
	var taxInvoiceID int64
	err = h.pool.QueryRow(r.Context(), `
		SELECT tax_invoice_id
		FROM public.summary_run_queue
		WHERE id = $1 AND tenant_id = $2`,
		queueID, claims.TenantID,
	).Scan(&taxInvoiceID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "Summary run không tồn tại hoặc chưa có hóa đơn liên kết.")
		return
	}

	payloadArg := []byte("null")
	if len(req.Payload) > 0 && string(req.Payload) != "null" {
		payloadArg = req.Payload
	}

	var rpcResult []byte
	rpcErr := db.WithAuthContext(r.Context(), h.pool,
		claims.UserUUID, string(claims.UserRole),
		func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), `
				SELECT public.transition_tax_invoice_state($1, $2, $3::jsonb, $4)`,
				taxInvoiceID, req.ToStatus, payloadArg, req.Note,
			).Scan(&rpcResult)
		},
	)
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể chuyển trạng thái hóa đơn.")
		httputil.WriteError(w, status, msg)
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"result": json.RawMessage(rpcResult),
	})
}

// mapRPCError maps known Postgres SQLSTATE codes from HĐĐT RPCs to HTTP
// status + Vietnamese user-facing message.
func mapRPCError(err error, fallbackMsg string) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "28000": // not_authenticated
			return http.StatusUnauthorized, "Phiên đăng nhập hết hạn."
		case "22023": // illegal_transition (check constraint / raise exception in state machine)
			return http.StatusConflict, "Chuyển trạng thái hóa đơn không hợp lệ."
		case "23505": // unique_violation
			return http.StatusConflict, "Summary run cho ngày này đã tồn tại."
		case "P0001": // raise_exception
			return http.StatusUnprocessableEntity, pgErr.Message
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

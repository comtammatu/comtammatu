package finance

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/summary-invoices/queue ─────────────────────────────────────
// Lists summary_run_queue rows for the tenant. No auth.uid() RPC — direct SELECT.

func (h *Handler) listSummaryRunQueue(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	daysBack := int64(30)
	if db2, ok := requireOptionalIntQuery(r, "days_back"); ok && db2 >= 1 && db2 <= 180 {
		daysBack = db2
	}

	const q = `
		SELECT id, branch_id, summary_date, status, trigger_source, triggered_by,
		       attempt_count, last_error, tax_invoice_id, started_at, finished_at, created_at
		FROM public.summary_run_queue
		WHERE tenant_id = $1
		  AND ($2::bigint IS NULL OR branch_id = $2)
		  AND summary_date >= (CURRENT_DATE - ($3 || ' days')::interval)::date
		ORDER BY created_at DESC
		LIMIT 500`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID, branchID, daysBack)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải hàng đợi.")
		return
	}
	defer rows.Close()

	type queueRow struct {
		ID            int64   `json:"id"`
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

	out := make([]queueRow, 0)
	for rows.Next() {
		var q queueRow
		if err := rows.Scan(
			&q.ID, &q.BranchID, &q.SummaryDate, &q.Status, &q.TriggerSource,
			&q.TriggeredBy, &q.AttemptCount, &q.LastError, &q.TaxInvoiceID,
			&q.StartedAt, &q.FinishedAt, &q.CreatedAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read queue row")
			return
		}
		out = append(out, q)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /finance/summary-invoices/transition ───────────────────────────────
// RPC transition_tax_invoice_state uses auth.uid() → WithAuthContext.
// Used by the summary invoice dashboard to manually advance states.

type transitionBody struct {
	TaxInvoiceID int64           `json:"tax_invoice_id"`
	ToStatus     string          `json:"to_status"`
	Payload      json.RawMessage `json:"payload"`
	Note         string          `json:"note"`
}

func (h *Handler) transitionTaxInvoiceState(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body transitionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.TaxInvoiceID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "tax_invoice_id không hợp lệ")
		return
	}
	if body.ToStatus == "" {
		httputil.WriteError(w, http.StatusBadRequest, "to_status là bắt buộc")
		return
	}

	var payload any
	if len(body.Payload) > 0 {
		payload = body.Payload
	}
	var noteArg *string
	if body.Note != "" {
		noteArg = &body.Note
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.transition_tax_invoice_state($1, $2, $3::jsonb, $4)`,
			body.TaxInvoiceID, body.ToStatus, payload, noteArg,
		)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể chuyển trạng thái hóa đơn.")
		httputil.WriteError(w, status, msg)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// requireOptionalIntQuery parses an optional integer query param.
// Returns (val, true) when present and valid, (0, false) otherwise.
func requireOptionalIntQuery(r *http.Request, key string) (int64, bool) {
	v := r.URL.Query().Get(key)
	if v == "" {
		return 0, false
	}
	n, err := parseInt64(v)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

func parseInt64(s string) (int64, error) {
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errInvalidInt
		}
		n = n*10 + int64(c-'0')
	}
	return n, nil
}

var errInvalidInt = jsonError("invalid integer")

type jsonError string

func (e jsonError) Error() string { return string(e) }

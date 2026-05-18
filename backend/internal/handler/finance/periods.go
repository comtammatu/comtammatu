package finance

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/periods ─────────────────────────────────────────────────────

func (h *Handler) listFiscalPeriods(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	const q = `
		SELECT id, period_month, period_year, status, closed_by, closed_at, notes, created_at
		FROM public.fiscal_periods
		WHERE tenant_id = $1
		ORDER BY period_year DESC, period_month DESC`

	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể tải danh sách kỳ kế toán.")
		return
	}
	defer rows.Close()

	type periodRow struct {
		ID          int64   `json:"id"`
		PeriodMonth int     `json:"period_month"`
		PeriodYear  int     `json:"period_year"`
		Status      string  `json:"status"`
		ClosedBy    *string `json:"closed_by"`
		ClosedAt    *string `json:"closed_at"`
		Notes       *string `json:"notes"`
		CreatedAt   string  `json:"created_at"`
	}

	out := make([]periodRow, 0)
	for rows.Next() {
		var p periodRow
		if err := rows.Scan(
			&p.ID, &p.PeriodMonth, &p.PeriodYear, &p.Status,
			&p.ClosedBy, &p.ClosedAt, &p.Notes, &p.CreatedAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read period")
			return
		}
		out = append(out, p)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// ─── POST /finance/periods/open ───────────────────────────────────────────────
// Direct UPSERT — open does not call a SECURITY DEFINER RPC.

type periodYearMonth struct {
	Year  int    `json:"year"`
	Month int    `json:"month"`
	Notes string `json:"notes"`
}

func (h *Handler) openFiscalPeriod(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body periodYearMonth
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Year < 2020 || body.Month < 1 || body.Month > 12 {
		httputil.WriteError(w, http.StatusBadRequest, "Năm/tháng không hợp lệ")
		return
	}

	type result struct {
		ID          int64  `json:"id"`
		PeriodMonth int    `json:"period_month"`
		PeriodYear  int    `json:"period_year"`
		Status      string `json:"status"`
	}
	var res result
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.fiscal_periods (tenant_id, period_month, period_year, status)
		 VALUES ($1, $2, $3, 'open')
		 ON CONFLICT (period_month, period_year, tenant_id)
		 DO UPDATE SET status = 'open'
		 RETURNING id, period_month, period_year, status`,
		claims.TenantID, body.Month, body.Year,
	).Scan(&res.ID, &res.PeriodMonth, &res.PeriodYear, &res.Status)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không thể mở kỳ kế toán.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, res)
}

// ─── POST /finance/periods/close ──────────────────────────────────────────────
// RPC close_fiscal_period uses auth.uid() → WithAuthContext.

func (h *Handler) closeFiscalPeriod(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body periodYearMonth
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Year < 2020 || body.Month < 1 || body.Month > 12 {
		httputil.WriteError(w, http.StatusBadRequest, "Năm/tháng không hợp lệ")
		return
	}
	var notesArg *string
	if body.Notes != "" {
		notesArg = &body.Notes
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.close_fiscal_period($1, $2, $3, $4)`,
			claims.TenantID, body.Year, body.Month, notesArg,
		).Scan(&raw)
	})
	if rpcErr != nil {
		// Mirror error branches from period-actions.ts closeFiscalPeriod.
		msg := rpcErr.Error()
		switch {
		case strings.Contains(msg, "fiscal_period_not_found"):
			httputil.WriteError(w, http.StatusNotFound, "Kỳ kế toán chưa được tạo.")
		case strings.Contains(msg, "fiscal_period_already_closed"):
			httputil.WriteError(w, http.StatusConflict, "Kỳ kế toán đã đóng.")
		default:
			status, vmsg := mapRPCError(rpcErr, "Không thể đóng kỳ kế toán.")
			httputil.WriteError(w, status, vmsg)
		}
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/periods/reconciliation ─────────────────────────────────────
// RPC gl_reconciliation uses auth.uid() → WithAuthContext.

func (h *Handler) getReconciliation(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	year, ok1 := requirePathInt(w, r.URL.Query().Get("year"))
	month, ok2 := requirePathInt(w, r.URL.Query().Get("month"))
	if !ok1 || !ok2 {
		return
	}
	if year < 2020 || month < 1 || month > 12 {
		httputil.WriteError(w, http.StatusBadRequest, "Năm/tháng không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.gl_reconciliation($1, $2, $3)`,
			claims.TenantID, year, month,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải báo cáo đối chiếu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

package finance

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

// ─── GET /finance/revenue/daily ─────────────────────────────────────────────
// RPC get_daily_revenue uses auth.uid() → WithAuthContext.

func (h *Handler) getDailyRevenue(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, ok := requireIntQuery(w, r, "branch_id")
	if !ok {
		return
	}
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_daily_revenue($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu doanh thu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/rollup ─────────────────────────────────────────────
// RPC get_revenue_rollup uses auth.uid() → WithAuthContext.

func (h *Handler) getRevenueRollup(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	granularity := r.URL.Query().Get("granularity")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}
	if granularity != "day" && granularity != "week" && granularity != "month" {
		httputil.WriteError(w, http.StatusBadRequest, "granularity phải là day/week/month")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_revenue_rollup($1, $2::date, $3::date, $4)`,
			branchID, startDate, endDate, granularity,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu doanh thu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/kpis ───────────────────────────────────────────────
// RPC get_revenue_kpis uses auth.uid() → WithAuthContext.

func (h *Handler) getRevenueKpis(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_revenue_kpis($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải chỉ số KPI.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/by-hour ────────────────────────────────────────────
// RPC get_revenue_by_hour uses auth.uid() → WithAuthContext.

func (h *Handler) getRevenueByHour(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_revenue_by_hour($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu doanh thu theo giờ.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/by-cashier ─────────────────────────────────────────
// RPC get_revenue_by_cashier uses auth.uid() → WithAuthContext.

func (h *Handler) getRevenueByCashier(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_revenue_by_cashier($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu thu ngân.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/top-items ──────────────────────────────────────────
// RPC get_top_items uses auth.uid() → WithAuthContext.

func (h *Handler) getTopItems(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	periodStart := r.URL.Query().Get("period_start")
	if !isDate(periodStart) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày bắt đầu không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_top_items($1, $2::date, 20)`,
			branchID, periodStart,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu top món.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/reconciliation-by-day ───────────────────────────────
// RPC fn_reconcile_sales_by_day uses auth.uid() → WithAuthContext.

func (h *Handler) getReconciliationByDay(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.fn_reconcile_sales_by_day($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải đối chiếu theo ngày.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/cash-variance ──────────────────────────────────────
// RPC get_cash_variance_summary uses auth.uid() → WithAuthContext.

func (h *Handler) getCashVarianceSummary(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_cash_variance_summary($1, $2::date, $3::date)`,
			branchID, startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu lệch tiền.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// ─── GET /finance/revenue/orders-for-day ─────────────────────────────────────
// RPC get_orders_for_day uses auth.uid() → WithAuthContext.

func (h *Handler) getOrdersForDay(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, ok := requireIntQuery(w, r, "branch_id")
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if !isDate(date) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_orders_for_day($1, $2::date)`,
			branchID, date,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải danh sách đơn.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

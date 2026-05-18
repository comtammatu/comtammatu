package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerReportRoutes(r chi.Router) {
	// Stock movement report (direct queries on stock_movements view)
	r.Get("/reports/movements", h.getStockMovementReport)

	// Branch movement summary
	r.Get("/reports/branch-movements", h.getBranchMovementSummary)

	// In-transit transfers
	r.Get("/reports/in-transit", h.getInTransitTransfers)

	// AP Aging report (direct queries on supplier_invoices)
	r.Get("/reports/ap-aging", h.getApAging)

	// Consumption variance report
	r.Get("/reports/consumption-variance", h.getConsumptionVariance)

	// Food cost (RPC: get_food_cost)
	r.Get("/reports/food-cost", h.getFoodCost)
}

// ─── GET /inventory/reports/movements ───────────────────────────────────────

func (h *Handler) getStockMovementReport(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_stock_movement_report($1::date, $2::date, $3)`,
			startDate, endDate, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải báo cáo biến động kho.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/reports/branch-movements ────────────────────────────────

func (h *Handler) getBranchMovementSummary(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
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
			`SELECT public.get_branch_movement_summary($1::date, $2::date)`,
			startDate, endDate,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải tổng hợp biến động theo chi nhánh.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/reports/in-transit ──────────────────────────────────────

func (h *Handler) getInTransitTransfers(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_in_transit_transfers()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tải được phiếu chuyển.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/reports/ap-aging ────────────────────────────────────────

func (h *Handler) getApAging(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_ap_aging()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tải được hóa đơn NCC.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/reports/consumption-variance ────────────────────────────

func (h *Handler) getConsumptionVariance(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	if !isDate(startDate) || !isDate(endDate) {
		httputil.WriteError(w, http.StatusBadRequest, "Ngày không hợp lệ (YYYY-MM-DD)")
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_consumption_variance($1::date, $2::date, $3)`,
			startDate, endDate, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải báo cáo variance.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/reports/food-cost ───────────────────────────────────────
// RPC get_food_cost uses auth.uid() → WithAuthContext.

func (h *Handler) getFoodCost(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_food_cost($1, $2, $3)`,
			branchID,
			nullableString(startDate),
			nullableString(endDate),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu food cost.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// Ensure chi.Router import is used (registrar functions take chi.Router param).
var _ chi.Router

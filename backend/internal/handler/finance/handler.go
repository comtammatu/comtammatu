// Package finance serves Finance/GL endpoints for the /finance route group.
//
// Ports the Node server actions under apps/web/app/finance/*.
// All routes are mounted at /finance and gated by RequireModule(ModuleFinance).
package finance

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/personal/comtammatu/backend/internal/auth"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves /finance/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for fine-grained gates
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns the chi.Router mounted at /finance.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// Revenue dashboard
	r.Get("/revenue/daily", h.getDailyRevenue)
	r.Get("/revenue/rollup", h.getRevenueRollup)
	r.Get("/revenue/kpis", h.getRevenueKpis)
	r.Get("/revenue/by-hour", h.getRevenueByHour)
	r.Get("/revenue/by-cashier", h.getRevenueByCashier)
	r.Get("/revenue/top-items", h.getTopItems)
	r.Get("/revenue/reconciliation-by-day", h.getReconciliationByDay)
	r.Get("/revenue/cash-variance", h.getCashVarianceSummary)
	r.Get("/revenue/orders-for-day", h.getOrdersForDay)

	// Reports
	r.Get("/dashboard/summary", h.getDashboardSummary)
	r.Get("/branches", h.getAccessibleBranches)
	r.Post("/views/refresh", h.refreshViews)
	r.Get("/food-cost", h.getFoodCost)

	// Invoices
	r.Get("/invoices", h.listInvoices)
	r.Get("/invoices/{id}/events", h.listInvoiceEvents)
	r.Post("/invoices/{id}/cancel", h.cancelInvoice)

	// Summary invoices
	r.Get("/summary-invoices/queue", h.listSummaryRunQueue)
	r.Post("/summary-invoices/transition", h.transitionTaxInvoiceState)

	// Audit
	r.Get("/audit-logs", h.getAuditLogs)

	// Chart of accounts
	r.Get("/chart-of-accounts", h.listChartOfAccounts)
	r.Post("/chart-of-accounts", h.createAccount)
	r.Put("/chart-of-accounts/{id}", h.updateAccount)
	r.Post("/chart-of-accounts/seed", h.seedChartOfAccounts)
	r.Post("/chart-of-accounts/{id}/toggle", h.toggleAccountActive)

	// Journals
	r.Get("/journals", h.listJournals)
	r.Post("/journals", h.createJournal)
	r.Post("/journals/{id}/post", h.postJournal)
	r.Post("/journals/{id}/void", h.voidJournal)

	// Fiscal periods
	r.Get("/periods", h.listFiscalPeriods)
	r.Post("/periods/open", h.openFiscalPeriod)
	r.Post("/periods/close", h.closeFiscalPeriod)
	r.Get("/periods/reconciliation", h.getReconciliation)

	// Posting rules
	r.Get("/posting-rules", h.listPostingRules)
	r.Put("/posting-rules/{id}", h.updatePostingRule)

	return r
}

// ─── helpers ────────────────────────────────────────────────────────────────

// claimsOrUnauthorized extracts JWT claims from context or writes 401 and returns nil.
func claimsOrUnauthorized(w http.ResponseWriter, r *http.Request) *auth.Claims {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return nil
	}
	return claims
}

// mapRPCError maps Postgres SQLSTATE codes raised by Finance/GL RPCs to HTTP
// status + Vietnamese user-facing message. Mirrors error branches in the Node
// actions. Falls back to 500 on unknown codes.
func mapRPCError(err error, fallbackMsg string) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return http.StatusConflict, "Dữ liệu bị trùng lặp."
		case "42501", "28000": // insufficient_privilege / not_authenticated
			switch {
			case strings.Contains(pgErr.Message, "not_authenticated"),
				strings.Contains(pgErr.Message, "unauthenticated"),
				strings.Contains(pgErr.Message, "missing auth context"):
				return http.StatusUnauthorized, "Chưa đăng nhập."
			default:
				return http.StatusForbidden, "Không có quyền."
			}
		case "22023": // invalid_parameter_value
			return http.StatusUnprocessableEntity, "Tham số không hợp lệ."
		case "P0001": // RAISE without specific code
			switch {
			case strings.Contains(pgErr.Message, "fiscal_period_not_found"):
				return http.StatusNotFound, "Kỳ kế toán chưa được tạo."
			case strings.Contains(pgErr.Message, "fiscal_period_already_closed"):
				return http.StatusConflict, "Kỳ kế toán đã đóng."
			case strings.Contains(pgErr.Message, "only_issued_can_be_replaced"),
				strings.Contains(pgErr.Message, "only_issued_can_be_cancelled"):
				return http.StatusConflict, "Trạng thái hóa đơn không cho phép thao tác này."
			case strings.Contains(pgErr.Message, "already_replaced"):
				return http.StatusConflict, "Hóa đơn này đã được thay thế."
			case strings.Contains(pgErr.Message, "replacement_chain_too_deep"):
				return http.StatusConflict, "Chuỗi thay thế quá sâu (tối đa 3 lần)."
			default:
				return http.StatusUnprocessableEntity, fallbackMsg
			}
		case "P0002": // no_data_found
			return http.StatusNotFound, "Không tìm thấy dữ liệu."
		case "23503": // foreign_key_violation
			return http.StatusUnprocessableEntity, "Tài khoản kế toán không hợp lệ."
		case "23514": // check_violation
			switch {
			case strings.Contains(pgErr.Message, "fiscal_period_closed_cannot_post"),
				strings.Contains(pgErr.Message, "current_period_closed_cannot_reverse"):
				return http.StatusConflict, "Không thể ghi sổ vào kỳ kế toán đã đóng."
			case strings.Contains(pgErr.Message, "period_closed_cannot_void"):
				return http.StatusConflict, "Không thể hủy bút toán đã ghi vào kỳ kế toán đã đóng."
			default:
				return http.StatusUnprocessableEntity, fallbackMsg
			}
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

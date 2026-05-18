// Package inventory serves Inventory endpoints for the /inventory route group.
//
// Ports the Node server actions under apps/web/app/inventory/*.
// All routes are mounted at /inventory and gated by RequireModule(ModuleInventory).
package inventory

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

// Handler serves /inventory/* routes.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker //nolint:unused // reserved for fine-grained gates
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// Routes returns the chi.Router mounted at /inventory.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	h.registerIngredientRoutes(r)
	h.registerRecipeRoutes(r)
	h.registerDashboardRoutes(r)
	h.registerProductionRoutes(r)
	h.registerWasteRoutes(r)
	h.registerIssueRoutes(r)
	h.registerReportRoutes(r)
	h.registerSettingsRoutes(r)
	h.registerGRNRoutes(r)
	h.registerPurchaseOrderRoutes(r)
	h.registerSupplierRoutes(r)
	h.registerSupplierReturnRoutes(r)
	h.registerStocktakeRoutes(r)
	h.registerVarianceRoutes(r)
	h.registerTransferRoutes(r)

	// Storage stubs — Supabase Storage / R2 deferred to Phase E.
	// POST /inventory/attachments and /inventory/grn-evidence are owned here
	// (GRN evidence collocated with attachment stubs for symmetry; Agent A's
	// GRN handler can redirect callers once Phase E lands).
	r.Post("/attachments", h.notImplementedStorage)
	r.Post("/grn-evidence", h.notImplementedStorage)

	return r
}

// notImplementedStorage returns 501 for storage endpoints pending Phase E (R2).
func (h *Handler) notImplementedStorage(w http.ResponseWriter, _ *http.Request) {
	httputil.WriteError(w, http.StatusNotImplemented,
		"Chức năng tải file chưa khả dụng (Phase E — Supabase Storage / R2 sẽ được tích hợp sau).")
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

// mapRPCError maps Postgres SQLSTATE codes raised by Inventory RPCs to HTTP
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
			case strings.Contains(pgErr.Message, "self-approval"):
				return http.StatusForbidden, "Không thể tự duyệt phiếu của mình (4-eye principle)."
			default:
				return http.StatusForbidden, "Không có quyền."
			}
		case "22023": // invalid_parameter_value
			return http.StatusUnprocessableEntity, "Tham số không hợp lệ."
		case "P0001": // RAISE without specific code
			switch {
			case strings.Contains(pgErr.Message, "uncounted_lines_exist"):
				return http.StatusConflict, "Còn nguyên liệu chưa được đếm."
			case strings.Contains(pgErr.Message, "session_not_in_progress"):
				return http.StatusConflict, "Phiên kiểm kê không ở trạng thái đang thực hiện."
			case strings.Contains(pgErr.Message, "session_not_found"):
				return http.StatusNotFound, "Không tìm thấy phiên kiểm kê."
			case strings.Contains(pgErr.Message, "insufficient_stock"):
				return http.StatusConflict, "Tồn kho không đủ để xuất."
			case strings.Contains(pgErr.Message, "insufficient_stock_for_production"):
				return http.StatusConflict, "Không đủ tồn kho nguyên liệu trong bếp trung tâm để sản xuất lệnh này."
			case strings.Contains(pgErr.Message, "production_recipe_missing"):
				return http.StatusConflict, "Thiếu công thức sản xuất cho thành phẩm này."
			case strings.Contains(pgErr.Message, "production_order_not_draft"):
				return http.StatusConflict, "Lệnh đã được xác nhận hoặc hủy trước đó."
			case strings.Contains(pgErr.Message, "production_order_empty"):
				return http.StatusUnprocessableEntity, "Lệnh sản xuất chưa có thành phẩm."
			case strings.Contains(pgErr.Message, "production_location_missing"):
				return http.StatusUnprocessableEntity, "Bếp trung tâm chưa có kho nhận mặc định."
			case strings.Contains(pgErr.Message, "production_order_not_found"):
				return http.StatusNotFound, "Không tìm thấy lệnh sản xuất."
			default:
				return http.StatusUnprocessableEntity, fallbackMsg
			}
		case "P0002": // no_data_found
			return http.StatusNotFound, "Không tìm thấy dữ liệu."
		case "23503": // foreign_key_violation
			return http.StatusUnprocessableEntity, "Tham chiếu dữ liệu không hợp lệ."
		case "23514": // check_violation
			return http.StatusUnprocessableEntity, fallbackMsg
		}
	}
	return http.StatusInternalServerError, fallbackMsg
}

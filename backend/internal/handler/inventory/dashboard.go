package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerDashboardRoutes(r chi.Router) {
	// Dashboard summary (RPC: get_inventory_dashboard — uses auth.uid() → WithAuthContext)
	r.Get("/dashboard", h.getInventoryDashboard)

	// Paginated alerts (RPC: get_inventory_alerts — uses auth.uid() → WithAuthContext)
	r.Get("/dashboard/alerts", h.getInventoryAlerts)

	// Manual MV refresh (RPC: refresh_inventory_dashboard)
	r.Post("/dashboard/refresh", h.refreshInventoryDashboard)

	// Inventory value endpoints (folded from inventory-value-actions.ts)
	r.Get("/value/system", h.getInventoryValueSystem)
	r.Get("/value/by-area", h.getInventoryValueByArea)
	r.Get("/value/by-branch", h.getInventoryValueByBranch)
}

// ─── GET /inventory/dashboard ───────────────────────────────────────────────
// RPC get_inventory_dashboard uses auth.uid() → WithAuthContext.

func (h *Handler) getInventoryDashboard(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, ok := requireIntQuery(w, r, "branch_id")
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_inventory_dashboard($1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tải được dashboard.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/dashboard/alerts ────────────────────────────────────────
// RPC get_inventory_alerts uses auth.uid() → WithAuthContext.

func (h *Handler) getInventoryAlerts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, ok := requireIntQuery(w, r, "branch_id")
	if !ok {
		return
	}

	limit := int64(50)
	if lq := r.URL.Query().Get("limit"); lq != "" {
		if n, ok2 := requirePathInt(w, lq); ok2 {
			if n > 200 {
				n = 200
			}
			limit = n
		}
	}
	offset := int64(0)
	if oq := r.URL.Query().Get("offset"); oq != "" {
		if n, ok2 := requirePathInt(w, oq); ok2 {
			offset = n
		}
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_inventory_alerts($1, $2, $3)`,
			branchID, limit, offset,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tải được danh sách alert.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/dashboard/refresh ──────────────────────────────────────
// RPC refresh_inventory_dashboard uses auth.uid() → WithAuthContext.

func (h *Handler) refreshInventoryDashboard(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.refresh_inventory_dashboard()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không refresh được dashboard.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"refreshedAt": raw})
}

// ─── GET /inventory/value/system ────────────────────────────────────────────

func (h *Handler) getInventoryValueSystem(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_inventory_value_system($1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tính giá trị tồn kho.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/value/by-area ───────────────────────────────────────────

func (h *Handler) getInventoryValueByArea(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_inventory_value_by_area()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải giá trị kho theo khu vực.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/value/by-branch ─────────────────────────────────────────

func (h *Handler) getInventoryValueByBranch(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_inventory_value_by_branch()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải giá trị kho theo chi nhánh.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

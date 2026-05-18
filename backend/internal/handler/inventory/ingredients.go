package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerIngredientRoutes(r chi.Router) {
	// Ingredient catalog
	r.Get("/ingredients", h.listIngredients)
	r.Post("/ingredients", h.createIngredient)
	r.Put("/ingredients/{id}", h.updateIngredient)
	r.Post("/ingredients/{id}/toggle", h.toggleIngredientActive)

	// Stock levels
	r.Get("/stock-levels", h.listStockLevels)
	r.Post("/stock/adjust", h.adjustStock)
	r.Get("/stock-alerts", h.listStockAlerts)

	// Expiry / reorder alerts
	r.Get("/alerts/expiry", h.listExpiryAlerts)
	r.Get("/alerts/reorder", h.listReorderAlerts)

	// Import / export
	r.Get("/ingredients/export", h.exportIngredients)
	r.Post("/ingredients/import", h.importIngredients)
	r.Get("/ingredients/template", h.downloadIngredientTemplate)
}

// ─── GET /inventory/ingredients ─────────────────────────────────────────────

func (h *Handler) listIngredients(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	limitQ := r.URL.Query().Get("limit")
	limit := int64(2000)
	if limitQ != "" {
		if n, ok := requirePathInt(w, limitQ); ok {
			if n > 5000 {
				n = 5000
			}
			limit = n
		} else {
			return
		}
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT json_agg(i ORDER BY i.name)
		   FROM (SELECT * FROM public.ingredients
		          WHERE tenant_id = $1
		          ORDER BY name
		          LIMIT $2) i`,
		claims.TenantID, limit,
	).Scan(&raw)
	if err != nil {
		status, msg := mapRPCError(err, "Không thể tải danh sách nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/ingredients ────────────────────────────────────────────

func (h *Handler) createIngredient(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		return tx.QueryRow(r.Context(),
			`SELECT public.create_ingredient($1::jsonb)`, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tạo nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, raw)
}

// ─── PUT /inventory/ingredients/{id} ────────────────────────────────────────

func (h *Handler) updateIngredient(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		return tx.QueryRow(r.Context(),
			`SELECT public.update_ingredient($1, $2::jsonb)`, id, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể cập nhật nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/ingredients/{id}/toggle ────────────────────────────────

func (h *Handler) toggleIngredientActive(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `SELECT public.toggle_ingredient_active($1)`, id)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể đổi trạng thái nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── GET /inventory/stock-levels ────────────────────────────────────────────

func (h *Handler) listStockLevels(w http.ResponseWriter, r *http.Request) {
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
			`SELECT json_agg(sl) FROM stock_levels sl WHERE sl.branch_id = $1`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải tồn kho.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/stock/adjust ───────────────────────────────────────────

func (h *Handler) adjustStock(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		_, err := tx.Exec(r.Context(), `SELECT public.adjust_stock($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể điều chỉnh tồn kho.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── GET /inventory/stock-alerts ────────────────────────────────────────────

func (h *Handler) listStockAlerts(w http.ResponseWriter, r *http.Request) {
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
			`SELECT json_agg(sl) FROM stock_levels sl WHERE sl.branch_id = $1`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải cảnh báo tồn kho.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/alerts/expiry ───────────────────────────────────────────

func (h *Handler) listExpiryAlerts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_expiry_alerts($1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải cảnh báo hạn sử dụng.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/alerts/reorder ──────────────────────────────────────────

func (h *Handler) listReorderAlerts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_reorder_alerts($1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải cảnh báo đặt hàng.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/ingredients/export ──────────────────────────────────────

func (h *Handler) exportIngredients(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	format := r.URL.Query().Get("format")
	if format != "csv" && format != "xlsx" {
		format = "xlsx"
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.export_ingredients($1)`, format,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xuất nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/ingredients/import ─────────────────────────────────────
// Import is handled via multipart form. The heavy parsing logic lives in the
// Node server action; the Go endpoint forwards the raw JSON body to the DB RPC.

func (h *Handler) importIngredients(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		return tx.QueryRow(r.Context(),
			`SELECT public.import_ingredients($1::jsonb)`, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể ghi dữ liệu nguyên liệu.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/ingredients/template ────────────────────────────────────

func (h *Handler) downloadIngredientTemplate(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.download_ingredient_template()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải template.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

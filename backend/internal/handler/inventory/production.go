package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerProductionRoutes(r chi.Router) {
	// Production orders
	r.Get("/production/orders", h.listProductionOrders)
	r.Post("/production/orders", h.createProductionOrder)
	r.Post("/production/orders/{id}/confirm", h.confirmProductionOrder)
	r.Post("/production/orders/{id}/cancel", h.cancelProductionOrder)
}

// ─── GET /inventory/production/orders ───────────────────────────────────────

func (h *Handler) listProductionOrders(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.list_production_orders()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải lệnh sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/production/orders ──────────────────────────────────────
// RPC create_production_order uses auth.uid() → WithAuthContext.

func (h *Handler) createProductionOrder(w http.ResponseWriter, r *http.Request) {
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
		_, err := tx.Exec(r.Context(), `SELECT public.create_production_order($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tạo lệnh sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]bool{"success": true})
}

// ─── POST /inventory/production/orders/{id}/confirm ─────────────────────────
// RPC confirm_production_order uses auth.uid() → WithAuthContext.

func (h *Handler) confirmProductionOrder(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.confirm_production_order($1)`, id)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xác nhận lệnh sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── POST /inventory/production/orders/{id}/cancel ──────────────────────────
// RPC cancel_production_order uses auth.uid() → WithAuthContext.

func (h *Handler) cancelProductionOrder(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.cancel_production_order($1)`, id)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể hủy lệnh sản xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

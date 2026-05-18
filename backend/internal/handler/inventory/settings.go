package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerSettingsRoutes(r chi.Router) {
	// QC settings (from supplier-return-actions.ts / trust-actions.ts pattern)
	r.Get("/settings/qc", h.getQcSettings)
	r.Put("/settings/qc", h.saveQcSettings)

	// Notification outbox dispatch
	r.Post("/settings/notifications/dispatch", h.dispatchNotificationOutbox)

	// Trust score self-view (RPC: compute_user_trust_score — uses auth.uid() → WithAuthContext)
	r.Get("/settings/trust-score", h.getMyTrustScore)
}

// ─── GET /inventory/settings/qc ─────────────────────────────────────────────

func (h *Handler) getQcSettings(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT row_to_json(s) FROM inventory_qc_settings s
			 WHERE s.tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::bigint
			 LIMIT 1`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải cấu hình QC.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── PUT /inventory/settings/qc ─────────────────────────────────────────────

func (h *Handler) saveQcSettings(w http.ResponseWriter, r *http.Request) {
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
		_, err := tx.Exec(r.Context(),
			`SELECT public.save_qc_settings($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể lưu cấu hình QC.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── POST /inventory/settings/notifications/dispatch ────────────────────────

func (h *Handler) dispatchNotificationOutbox(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.dispatch_notification_outbox()`,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể dispatch outbox.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/settings/trust-score ────────────────────────────────────
// RPC compute_user_trust_score uses auth.uid() → WithAuthContext.

func (h *Handler) getMyTrustScore(w http.ResponseWriter, r *http.Request) {
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
			`SELECT public.compute_user_trust_score(auth.uid(), $1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không đọc được trust score.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

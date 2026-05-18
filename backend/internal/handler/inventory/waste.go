package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerWasteRoutes(r chi.Router) {
	// Waste entry (RPC: create_waste_entry — uses auth.uid() → WithAuthContext)
	r.Post("/waste", h.createWasteEntry)

	// Waste approval (RPC: approve_waste — uses auth.uid() → WithAuthContext)
	r.Post("/waste/{id}/approve", h.approveWaste)

	// Waste cap status (direct queries)
	r.Get("/waste/cap-status", h.getWasteCapStatus)

	// Rolling ingredient waste meter (direct queries)
	r.Get("/waste/rolling", h.getIngredientRollingWaste)
}

// ─── POST /inventory/waste ───────────────────────────────────────────────────
// RPC create_waste_entry uses auth.uid() → WithAuthContext.

func (h *Handler) createWasteEntry(w http.ResponseWriter, r *http.Request) {
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
			`SELECT public.create_waste_entry($1::jsonb)`, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tạo được phiếu hủy.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, raw)
}

// ─── POST /inventory/waste/{id}/approve ─────────────────────────────────────
// RPC approve_waste uses auth.uid() → WithAuthContext.

func (h *Handler) approveWaste(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "Body không hợp lệ")
		return
	}
	if body.Decision != "approved" && body.Decision != "rejected" {
		httputil.WriteError(w, http.StatusBadRequest, "decision phải là approved hoặc rejected")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.approve_waste($1, $2, $3)`,
			id, body.Decision, body.Note,
		)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không duyệt được.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── GET /inventory/waste/cap-status ────────────────────────────────────────

func (h *Handler) getWasteCapStatus(w http.ResponseWriter, r *http.Request) {
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
			`SELECT public.get_waste_cap_status($1)`, branchID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải trạng thái cap waste.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── GET /inventory/waste/rolling ───────────────────────────────────────────

func (h *Handler) getIngredientRollingWaste(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID, ok := requireIntQuery(w, r, "branch_id")
	if !ok {
		return
	}
	ingredientID, ok := requireIntQuery(w, r, "ingredient_id")
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_ingredient_rolling_waste($1, $2)`,
			branchID, ingredientID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tải dữ liệu rolling waste.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

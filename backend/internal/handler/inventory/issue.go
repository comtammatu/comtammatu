package inventory

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerIssueRoutes(r chi.Router) {
	// Stock issues
	r.Get("/issues", h.listStockIssues)
	r.Post("/issues", h.createStockIssueDraft)
	r.Get("/issues/{id}", h.getStockIssueDetail)
	r.Post("/issues/{id}/lines", h.upsertStockIssueLine)
	r.Delete("/issues/{id}/lines/{lineId}", h.deleteStockIssueLine)

	// Confirm stock issue (RPC: confirm_stock_issue — uses auth.uid() → WithAuthContext)
	r.Post("/issues/{id}/confirm", h.confirmStockIssue)
	r.Post("/issues/{id}/cancel", h.cancelStockIssue)
}

// ─── GET /inventory/issues ───────────────────────────────────────────────────

func (h *Handler) listStockIssues(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchID := nullableIntQuery(r, "branch_id")
	status := r.URL.Query().Get("status")

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.list_stock_issues($1, $2)`, branchID, nullableString(status),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status2, msg := mapRPCError(rpcErr, "Không thể tải danh sách phiếu xuất.")
		httputil.WriteError(w, status2, msg)
		return
	}
	if raw == nil {
		raw = json.RawMessage("[]")
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/issues ──────────────────────────────────────────────────

func (h *Handler) createStockIssueDraft(w http.ResponseWriter, r *http.Request) {
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
			`SELECT public.create_stock_issue_draft($1::jsonb)`, string(b),
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể tạo phiếu xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, raw)
}

// ─── GET /inventory/issues/{id} ──────────────────────────────────────────────

func (h *Handler) getStockIssueDetail(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_stock_issue_detail($1)`, id,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không tìm thấy phiếu xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/issues/{id}/lines ──────────────────────────────────────

func (h *Handler) upsertStockIssueLine(w http.ResponseWriter, r *http.Request) {
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
	body["issueId"] = id

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		b, _ := json.Marshal(body)
		_, err := tx.Exec(r.Context(),
			`SELECT public.upsert_stock_issue_line($1::jsonb)`, string(b))
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể lưu dòng phiếu xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── DELETE /inventory/issues/{id}/lines/{lineId} ───────────────────────────

func (h *Handler) deleteStockIssueLine(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	lineID, ok := requirePathInt(w, chi.URLParam(r, "lineId"))
	if !ok {
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.delete_stock_issue_line($1, $2)`, id, lineID)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xóa dòng.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ─── POST /inventory/issues/{id}/confirm ────────────────────────────────────
// RPC confirm_stock_issue uses auth.uid() → WithAuthContext.

func (h *Handler) confirmStockIssue(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	id, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.confirm_stock_issue($1)`, id,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể xác nhận phiếu xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, raw)
}

// ─── POST /inventory/issues/{id}/cancel ─────────────────────────────────────

func (h *Handler) cancelStockIssue(w http.ResponseWriter, r *http.Request) {
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
			`SELECT public.cancel_stock_issue($1)`, id)
		return err
	})
	if rpcErr != nil {
		status, msg := mapRPCError(rpcErr, "Không thể hủy phiếu xuất.")
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// nullableString returns nil for empty strings (for SQL nullable text params).
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

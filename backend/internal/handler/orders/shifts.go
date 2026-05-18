package orders

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// CloseShift handles POST /br/{branchId}/shifts/close.
// It calls the close_pos_session RPC which performs cash reconciliation atomically.
func (h *Handler) CloseShift(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	branchID, err := strconv.ParseInt(chi.URLParam(r, "branchId"), 10, 64)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid branch id")
		return
	}
	_ = branchID // branch ownership enforced by RLS on pos_sessions

	var req CloseShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SessionID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	if req.ClosingCash == "" {
		httputil.WriteError(w, http.StatusBadRequest, "closing_cash is required")
		return
	}

	// close_pos_session uses auth.uid() internally — must run inside WithAuthContext.
	const q = `SELECT public.close_pos_session($1, $2::NUMERIC(15,2), $3)`
	var resultJSON []byte
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), q,
			req.SessionID,
			req.ClosingCash,
			req.Note,
		).Scan(&resultJSON)
	})
	if rpcErr != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to close shift")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(resultJSON))
}

package inventory

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/personal/comtammatu/backend/internal/db"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerStocktakeRoutes(r chi.Router) {
	// Session lifecycle
	r.Post("/stocktake/sessions", h.startStocktake)
	r.Get("/stocktake/sessions/{id}/lines-blind", h.getStocktakeLinesBlind)
	r.Post("/stocktake/sessions/{id}/submit-round", h.submitCountRound)
	r.Post("/stocktake/sessions/{id}/draft", h.saveStocktakeDraft)
	r.Post("/stocktake/sessions/{id}/close-round", h.closeRecountRound)
	r.Post("/stocktake/sessions/{id}/escalate-round4", h.escalateRound4)
	r.Post("/stocktake/sessions/{id}/finalize", h.finalizeStocktake)

	// Zone locks
	r.Post("/stocktake/sessions/{id}/zone-lock/acquire", h.acquireZoneLock)
	r.Post("/stocktake/sessions/{id}/zone-lock/heartbeat", h.heartbeatZoneLock)
	r.Post("/stocktake/sessions/{id}/zone-lock/release", h.releaseZoneLock)

	// Conflicts
	r.Get("/stocktake/conflicts", h.listStocktakeConflicts)
	r.Post("/stocktake/conflicts/{id}/resolve", h.resolveStocktakeConflict)
}

// POST /inventory/stocktake/sessions
// RPC start_stocktake uses auth.uid() → WithAuthContext.
func (h *Handler) startStocktake(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	var body struct {
		BranchID     int64    `json:"branch_id"`
		LocationID   *int64   `json:"location_id"`
		Mode         string   `json:"mode"`
		BlindMode    *bool    `json:"blind_mode"`
		ThresholdPct *float64 `json:"threshold_pct"`
		ThresholdVnd *float64 `json:"threshold_vnd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.BranchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id không hợp lệ")
		return
	}
	validModes := map[string]bool{"daily": true, "weekly": true, "monthly": true, "quarterly": true, "spot": true}
	if !validModes[body.Mode] {
		httputil.WriteError(w, http.StatusBadRequest, "mode không hợp lệ")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.start_stocktake($1, $2, $3, $4, $5, $6)`,
			body.BranchID, body.LocationID, body.Mode, body.BlindMode, body.ThresholdPct, body.ThresholdVnd,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapStocktakeError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, json.RawMessage(raw))
}

// GET /inventory/stocktake/sessions/{id}/lines-blind
// RPC get_stocktake_lines_blind uses auth.uid() → WithAuthContext.
func (h *Handler) getStocktakeLinesBlind(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.get_stocktake_lines_blind($1)`, sessionID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		status, msg := mapStocktakeError(rpcErr)
		httputil.WriteError(w, status, msg)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// POST /inventory/stocktake/sessions/{id}/submit-round
// RPC submit_count_round uses auth.uid() → WithAuthContext.
func (h *Handler) submitCountRound(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		RoundNo int             `json:"round_no"`
		Counts  json.RawMessage `json:"counts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.RoundNo < 1 || body.RoundNo > 4 {
		httputil.WriteError(w, http.StatusBadRequest, "round_no phải từ 1 đến 4")
		return
	}
	if len(body.Counts) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "counts không được trống")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.submit_count_round($1, $2, $3::jsonb)`,
			sessionID, body.RoundNo, body.Counts,
		).Scan(&raw)
	})
	if rpcErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) && pgErr.Code == "42501" {
			httputil.WriteError(w, http.StatusForbidden, "Không có quyền hoặc kỳ đã đóng")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không submit được vòng đếm.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// POST /inventory/stocktake/sessions/{id}/draft
// Direct table upsert — no auth.uid() RPC needed.
func (h *Handler) saveStocktakeDraft(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		DraftCounts json.RawMessage `json:"draft_counts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.pool.Exec(r.Context(),
		`INSERT INTO public.stocktake_drafts (session_id, draft_counts, last_saved_at, saved_by)
		 VALUES ($1, $2::jsonb, $3::timestamptz, $4)
		 ON CONFLICT (session_id) DO UPDATE
		   SET draft_counts = EXCLUDED.draft_counts,
		       last_saved_at = EXCLUDED.last_saved_at,
		       saved_by = EXCLUDED.saved_by`,
		sessionID, body.DraftCounts, now, claims.UserUUID,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không lưu draft được")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"last_saved_at": now})
}

// POST /inventory/stocktake/sessions/{id}/zone-lock/acquire
func (h *Handler) acquireZoneLock(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		ZoneID     string `json:"zone_id"`
		TTLSeconds *int   `json:"ttl_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ZoneID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "zone_id không được trống")
		return
	}
	ttl := 1800
	if body.TTLSeconds != nil {
		ttl = *body.TTLSeconds
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.acquire_zone_lock($1, $2, $3)`, sessionID, body.ZoneID, ttl,
	).Scan(&raw)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không acquire được lock")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// POST /inventory/stocktake/sessions/{id}/zone-lock/heartbeat
func (h *Handler) heartbeatZoneLock(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		ZoneID     string `json:"zone_id"`
		TTLSeconds *int   `json:"ttl_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ZoneID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "zone_id không được trống")
		return
	}
	ttl := 1800
	if body.TTLSeconds != nil {
		ttl = *body.TTLSeconds
	}

	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.heartbeat_zone_lock($1, $2, $3)`, sessionID, body.ZoneID, ttl,
	).Scan(&raw)
	if err != nil {
		httputil.WriteError(w, http.StatusConflict, "Lock không còn hoặc mất ownership")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// POST /inventory/stocktake/sessions/{id}/zone-lock/release
func (h *Handler) releaseZoneLock(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		ZoneID string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ZoneID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "zone_id không được trống")
		return
	}

	var released bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT public.release_zone_lock($1, $2)`, sessionID, body.ZoneID,
	).Scan(&released)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không release được")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"released": released})
}

// POST /inventory/stocktake/sessions/{id}/close-round
// RPC close_recount_round uses auth.uid() → WithAuthContext.
func (h *Handler) closeRecountRound(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		RoundNo int `json:"round_no"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.RoundNo < 1 || body.RoundNo > 4 {
		httputil.WriteError(w, http.StatusBadRequest, "round_no phải từ 1 đến 4")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.close_recount_round($1, $2)`, sessionID, body.RoundNo,
		).Scan(&raw)
	})
	if rpcErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) && pgErr.Code == "42501" {
			httputil.WriteError(w, http.StatusForbidden, "Không có quyền đóng round")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không đóng được vòng đếm.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// POST /inventory/stocktake/sessions/{id}/escalate-round4
// RPC escalate_round_4 uses auth.uid() → WithAuthContext.
func (h *Handler) escalateRound4(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		IngredientID int64   `json:"ingredient_id"`
		FinalQty     float64 `json:"final_qty"`
		Note         string  `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.IngredientID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ingredient_id không hợp lệ")
		return
	}
	if body.FinalQty < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "final_qty không hợp lệ")
		return
	}
	if len([]rune(body.Note)) < 20 {
		httputil.WriteError(w, http.StatusBadRequest, "Ghi chú escalation phải ≥ 20 ký tự")
		return
	}

	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`SELECT public.escalate_round_4($1, $2, $3, $4)`,
			sessionID, body.IngredientID, body.FinalQty, body.Note,
		)
		return err
	})
	if rpcErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) {
			switch pgErr.Code {
			case "42501":
				httputil.WriteError(w, http.StatusForbidden, "Không có quyền escalate")
				return
			case "22023":
				httputil.WriteError(w, http.StatusUnprocessableEntity, "Escalation không hợp lệ hoặc thiếu ghi chú bắt buộc.")
				return
			}
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không escalation được dòng kiểm kê.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"session_id":    sessionID,
		"ingredient_id": body.IngredientID,
		"final_qty":     body.FinalQty,
	})
}

// POST /inventory/stocktake/sessions/{id}/finalize
// RPC finalize_stocktake uses auth.uid() → WithAuthContext.
func (h *Handler) finalizeStocktake(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.finalize_stocktake($1)`, sessionID,
		).Scan(&raw)
	})
	if rpcErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) {
			switch pgErr.Code {
			case "42501":
				httputil.WriteError(w, http.StatusForbidden, "Không có quyền finalize")
				return
			case "22023":
				httputil.WriteError(w, http.StatusUnprocessableEntity, "Chưa thể hoàn tất: còn dòng chưa final hoặc còn xung đột cần xử lý.")
				return
			}
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không hoàn tất được kiểm kê.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// GET /inventory/stocktake/conflicts
func (h *Handler) listStocktakeConflicts(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	branchIDStr := r.URL.Query().Get("branch_id")
	if branchIDStr == "" {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id không hợp lệ")
		return
	}
	branchID, err := strconv.ParseInt(branchIDStr, 10, 64)
	if err != nil || branchID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "branch_id không hợp lệ")
		return
	}

	includeResolved := r.URL.Query().Get("include_resolved") == "true"
	limit := int64(100)
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.ParseInt(lStr, 10, 64); err == nil && l > 0 && l <= 500 {
			limit = l
		}
	}

	q := `
		SELECT sc.id, sc.session_id, sc.ingredient_id, i.name AS ingredient_name,
		       sc.round_no, sc.conflict_type, sc.client_payload, sc.server_payload,
		       sc.submitted_by, sc.submitted_at, sc.resolved_at, sc.resolution,
		       sc.resolution_qty, sc.resolution_note
		FROM public.stocktake_conflicts sc
		JOIN public.stocktake_sessions ss ON ss.id = sc.session_id
		JOIN public.ingredients i ON i.id = sc.ingredient_id
		WHERE ss.branch_id = $1
		  AND ($2::bool OR sc.resolved_at IS NULL)
		ORDER BY sc.submitted_at DESC
		LIMIT $3`

	rows, err := h.pool.Query(r.Context(), q, branchID, includeResolved, limit)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được conflict queue")
		return
	}
	defer rows.Close()

	type conflictRow struct {
		ID             int64           `json:"id"`
		SessionID      int64           `json:"session_id"`
		IngredientID   int64           `json:"ingredient_id"`
		IngredientName string          `json:"ingredient_name"`
		RoundNo        int             `json:"round_no"`
		ConflictType   string          `json:"conflict_type"`
		ClientPayload  json.RawMessage `json:"client_payload"`
		ServerPayload  json.RawMessage `json:"server_payload"`
		SubmittedBy    *string         `json:"submitted_by"`
		SubmittedAt    string          `json:"submitted_at"`
		ResolvedAt     *string         `json:"resolved_at"`
		Resolution     *string         `json:"resolution"`
		ResolutionQty  *float64        `json:"resolution_qty"`
		ResolutionNote *string         `json:"resolution_note"`
	}

	out := make([]conflictRow, 0)
	for rows.Next() {
		var c conflictRow
		var submittedAt time.Time
		var resolvedAt *time.Time
		if err := rows.Scan(
			&c.ID, &c.SessionID, &c.IngredientID, &c.IngredientName,
			&c.RoundNo, &c.ConflictType, &c.ClientPayload, &c.ServerPayload,
			&c.SubmittedBy, &submittedAt, &resolvedAt, &c.Resolution,
			&c.ResolutionQty, &c.ResolutionNote,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read conflict")
			return
		}
		c.SubmittedAt = submittedAt.Format(time.RFC3339)
		if resolvedAt != nil {
			s := resolvedAt.Format(time.RFC3339)
			c.ResolvedAt = &s
		}
		out = append(out, c)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// POST /inventory/stocktake/conflicts/{id}/resolve
// RPC resolve_stocktake_conflict uses auth.uid() → WithAuthContext.
func (h *Handler) resolveStocktakeConflict(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	conflictID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Resolution string   `json:"resolution"`
		ManualQty  *float64 `json:"manual_qty"`
		Note       *string  `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	validResolutions := map[string]bool{"keep_server": true, "apply_client": true, "manual_value": true, "reject": true}
	if !validResolutions[body.Resolution] {
		httputil.WriteError(w, http.StatusBadRequest, "resolution không hợp lệ")
		return
	}
	if body.Resolution == "manual_value" && body.ManualQty == nil {
		httputil.WriteError(w, http.StatusBadRequest, "Phải nhập số lượng thủ công")
		return
	}

	var raw json.RawMessage
	rpcErr := db.WithAuthContext(r.Context(), h.pool, claims.UserUUID, string(claims.UserRole), func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(),
			`SELECT public.resolve_stocktake_conflict($1, $2, $3, $4)`,
			conflictID, body.Resolution, body.ManualQty, body.Note,
		).Scan(&raw)
	})
	if rpcErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(rpcErr, &pgErr) {
			switch pgErr.Code {
			case "42501":
				httputil.WriteError(w, http.StatusForbidden, "Không có quyền resolve")
				return
			case "22023":
				httputil.WriteError(w, http.StatusUnprocessableEntity, "Cách xử lý xung đột không hợp lệ hoặc thiếu số lượng thủ công.")
				return
			}
		}
		httputil.WriteError(w, http.StatusInternalServerError, "Không xử lý được xung đột kiểm kê.")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

// mapStocktakeError maps Postgres SQLSTATE codes for stocktake RPCs.
func mapStocktakeError(err error) (int, string) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "42501":
			return http.StatusForbidden, "Không có quyền."
		case "22023":
			return http.StatusUnprocessableEntity, "Tham số không hợp lệ."
		case "P0002":
			return http.StatusNotFound, "Không tìm thấy dữ liệu."
		case "23505":
			return http.StatusConflict, "Dữ liệu bị trùng lặp."
		}
	}
	return http.StatusInternalServerError, "Lỗi hệ thống."
}

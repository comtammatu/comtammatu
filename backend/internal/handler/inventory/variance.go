package inventory

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/personal/comtammatu/backend/internal/httputil"
)

func (h *Handler) registerVarianceRoutes(r chi.Router) {
	r.Get("/variance/report", h.getVarianceReport)
	r.Get("/variance/sessions/{id}", h.getVarianceSession)
	r.Get("/variance/by-ingredient", h.getVarianceByIngredient)
	r.Get("/variance/trend", h.getVarianceTrend)
	r.Get("/variance/abc-snapshot", h.getABCSnapshot)
}

// GET /inventory/variance/report
// Returns aggregated variance report for a branch within a date range.
func (h *Handler) getVarianceReport(w http.ResponseWriter, r *http.Request) {
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

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	q := `
		SELECT sv.ingredient_id, i.name AS ingredient_name, i.unit,
		       sv.system_qty, sv.counted_qty,
		       sv.variance_qty, sv.variance_pct,
		       sv.abc_class, sv.session_id, sv.finalized_at
		FROM public.stocktake_variances sv
		JOIN public.ingredients i ON i.id = sv.ingredient_id
		JOIN public.stocktake_sessions ss ON ss.id = sv.session_id
		WHERE ss.branch_id = $1
		  AND ss.tenant_id = $2
		  AND ($3::date IS NULL OR ss.finalized_at::date >= $3::date)
		  AND ($4::date IS NULL OR ss.finalized_at::date <= $4::date)
		ORDER BY ABS(sv.variance_qty) DESC
		LIMIT 500`

	var sArg, eArg *string
	if startDate != "" {
		sArg = &startDate
	}
	if endDate != "" {
		eArg = &endDate
	}

	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID, sArg, eArg)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được báo cáo chênh lệch.")
		return
	}
	defer rows.Close()

	type varianceRow struct {
		IngredientID   int64    `json:"ingredient_id"`
		IngredientName string   `json:"ingredient_name"`
		Unit           string   `json:"unit"`
		SystemQty      float64  `json:"system_qty"`
		CountedQty     float64  `json:"counted_qty"`
		VarianceQty    float64  `json:"variance_qty"`
		VariancePct    *float64 `json:"variance_pct"`
		ABCClass       *string  `json:"abc_class"`
		SessionID      int64    `json:"session_id"`
		FinalizedAt    *string  `json:"finalized_at"`
	}

	out := make([]varianceRow, 0)
	for rows.Next() {
		var v varianceRow
		var finalizedAt *string
		if err := rows.Scan(
			&v.IngredientID, &v.IngredientName, &v.Unit,
			&v.SystemQty, &v.CountedQty, &v.VarianceQty, &v.VariancePct,
			&v.ABCClass, &v.SessionID, &finalizedAt,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read variance row")
			return
		}
		v.FinalizedAt = finalizedAt
		out = append(out, v)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// GET /inventory/variance/sessions/{id}
// Returns variance detail for a single stocktake session.
func (h *Handler) getVarianceSession(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}
	sessionID, ok := requirePathInt(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	q := `
		SELECT sv.ingredient_id, i.name AS ingredient_name, i.unit,
		       sv.system_qty, sv.counted_qty,
		       sv.variance_qty, sv.variance_pct, sv.abc_class
		FROM public.stocktake_variances sv
		JOIN public.ingredients i ON i.id = sv.ingredient_id
		JOIN public.stocktake_sessions ss ON ss.id = sv.session_id
		WHERE sv.session_id = $1
		  AND ss.tenant_id = $2
		ORDER BY ABS(sv.variance_qty) DESC`

	rows, err := h.pool.Query(r.Context(), q, sessionID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được chênh lệch phiên.")
		return
	}
	defer rows.Close()

	type varianceRow struct {
		IngredientID   int64    `json:"ingredient_id"`
		IngredientName string   `json:"ingredient_name"`
		Unit           string   `json:"unit"`
		SystemQty      float64  `json:"system_qty"`
		CountedQty     float64  `json:"counted_qty"`
		VarianceQty    float64  `json:"variance_qty"`
		VariancePct    *float64 `json:"variance_pct"`
		ABCClass       *string  `json:"abc_class"`
	}

	out := make([]varianceRow, 0)
	for rows.Next() {
		var v varianceRow
		if err := rows.Scan(
			&v.IngredientID, &v.IngredientName, &v.Unit,
			&v.SystemQty, &v.CountedQty, &v.VarianceQty, &v.VariancePct, &v.ABCClass,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read variance row")
			return
		}
		out = append(out, v)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// GET /inventory/variance/by-ingredient
// Returns variance history for a specific ingredient across sessions.
func (h *Handler) getVarianceByIngredient(w http.ResponseWriter, r *http.Request) {
	claims := claimsOrUnauthorized(w, r)
	if claims == nil {
		return
	}

	ingIDStr := r.URL.Query().Get("ingredient_id")
	if ingIDStr == "" {
		httputil.WriteError(w, http.StatusBadRequest, "ingredient_id không hợp lệ")
		return
	}
	ingredientID, err := strconv.ParseInt(ingIDStr, 10, 64)
	if err != nil || ingredientID <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "ingredient_id không hợp lệ")
		return
	}

	branchIDStr := r.URL.Query().Get("branch_id")
	var branchID *int64
	if branchIDStr != "" {
		n, err := strconv.ParseInt(branchIDStr, 10, 64)
		if err == nil && n > 0 {
			branchID = &n
		}
	}

	q := `
		SELECT sv.session_id, ss.mode, ss.finalized_at,
		       sv.system_qty, sv.counted_qty, sv.variance_qty, sv.variance_pct
		FROM public.stocktake_variances sv
		JOIN public.stocktake_sessions ss ON ss.id = sv.session_id
		WHERE sv.ingredient_id = $1
		  AND ss.tenant_id = $2
		  AND ($3::bigint IS NULL OR ss.branch_id = $3)
		  AND ss.status = 'completed'
		ORDER BY ss.finalized_at DESC
		LIMIT 50`

	rows, err := h.pool.Query(r.Context(), q, ingredientID, claims.TenantID, branchID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được lịch sử chênh lệch.")
		return
	}
	defer rows.Close()

	type historyRow struct {
		SessionID   int64    `json:"session_id"`
		Mode        string   `json:"mode"`
		FinalizedAt *string  `json:"finalized_at"`
		SystemQty   float64  `json:"system_qty"`
		CountedQty  float64  `json:"counted_qty"`
		VarianceQty float64  `json:"variance_qty"`
		VariancePct *float64 `json:"variance_pct"`
	}

	out := make([]historyRow, 0)
	for rows.Next() {
		var h historyRow
		if err := rows.Scan(
			&h.SessionID, &h.Mode, &h.FinalizedAt,
			&h.SystemQty, &h.CountedQty, &h.VarianceQty, &h.VariancePct,
		); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read history row")
			return
		}
		out = append(out, h)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// GET /inventory/variance/trend
// Returns variance trend summary (avg pct, count above threshold) by week/month.
func (h *Handler) getVarianceTrend(w http.ResponseWriter, r *http.Request) {
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

	granularity := r.URL.Query().Get("granularity") // "week" or "month"
	if granularity != "week" && granularity != "month" {
		granularity = "week"
	}

	q := `
		SELECT date_trunc($3, ss.finalized_at) AS period,
		       COUNT(*) AS session_count,
		       AVG(ABS(sv.variance_pct)) AS avg_variance_pct,
		       COUNT(*) FILTER (WHERE ABS(sv.variance_pct) > 5) AS above_threshold_count
		FROM public.stocktake_variances sv
		JOIN public.stocktake_sessions ss ON ss.id = sv.session_id
		WHERE ss.branch_id = $1
		  AND ss.tenant_id = $2
		  AND ss.status = 'completed'
		  AND sv.variance_pct IS NOT NULL
		GROUP BY 1
		ORDER BY 1 DESC
		LIMIT 52`

	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID, granularity)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được xu hướng chênh lệch.")
		return
	}
	defer rows.Close()

	out := make([]json.RawMessage, 0)
	for rows.Next() {
		var period string
		var sessionCount int64
		var avgPct *float64
		var aboveThreshold int64
		if err := rows.Scan(&period, &sessionCount, &avgPct, &aboveThreshold); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read trend row")
			return
		}
		item, _ := json.Marshal(map[string]any{
			"period":                period,
			"session_count":         sessionCount,
			"avg_variance_pct":      avgPct,
			"above_threshold_count": aboveThreshold,
		})
		out = append(out, item)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

// GET /inventory/variance/abc-snapshot
// Returns the latest ABC class snapshot for a branch.
func (h *Handler) getABCSnapshot(w http.ResponseWriter, r *http.Request) {
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

	q := `
		SELECT ia.ingredient_id, i.name, i.unit, ia.abc_class, ia.snapshot_at
		FROM public.ingredient_abc_classes ia
		JOIN public.ingredients i ON i.id = ia.ingredient_id
		WHERE ia.branch_id = $1
		  AND ia.tenant_id = $2
		ORDER BY ia.abc_class, i.name`

	rows, err := h.pool.Query(r.Context(), q, branchID, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "Không tải được ABC snapshot.")
		return
	}
	defer rows.Close()

	type abcRow struct {
		IngredientID int64  `json:"ingredient_id"`
		Name         string `json:"name"`
		Unit         string `json:"unit"`
		ABCClass     string `json:"abc_class"`
		SnapshotAt   string `json:"snapshot_at"`
	}

	out := make([]abcRow, 0)
	for rows.Next() {
		var a abcRow
		if err := rows.Scan(&a.IngredientID, &a.Name, &a.Unit, &a.ABCClass, &a.SnapshotAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read abc row")
			return
		}
		out = append(out, a)
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"data": out})
}

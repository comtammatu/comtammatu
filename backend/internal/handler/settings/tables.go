package settings

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Table represents a physical table in a branch zone.
// TODO: migrate to public.branch_tables once that table is created; currently backed by public.branch_zones as placeholder.
type Table struct {
	ID       int64  `json:"id"`
	TenantID int64  `json:"tenant_id"`
	AreaID   int64  `json:"area_id"`
	Name     string `json:"name"`
	Capacity int    `json:"capacity"`
}

func (h *Handler) listTables(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// TODO: use public.branch_tables when available; branch_zones used as placeholder
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, tenant_id, id, name, 0 FROM public.branch_zones WHERE tenant_id = $1 ORDER BY name`,
		claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch tables")
		return
	}
	defer rows.Close()
	result := make([]Table, 0)
	for rows.Next() {
		var t Table
		if err := rows.Scan(&t.ID, &t.TenantID, &t.AreaID, &t.Name, &t.Capacity); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read table")
			return
		}
		result = append(result, t)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) createTable(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		AreaID   int64  `json:"area_id"`
		Name     string `json:"name"`
		Capacity int    `json:"capacity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	// TODO: use public.branch_tables when available; branch_zones used as placeholder
	var t Table
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO public.branch_zones (tenant_id, branch_id, name) VALUES ($1,$2,$3)
		 RETURNING id, tenant_id, id, name, 0`,
		claims.TenantID, req.AreaID, req.Name).
		Scan(&t.ID, &t.TenantID, &t.AreaID, &t.Name, &t.Capacity)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create table")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, t)
}

func (h *Handler) updateTable(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Name     *string `json:"name"`
		Capacity *int    `json:"capacity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// TODO: use public.branch_tables when available; branch_zones used as placeholder
	var t Table
	err = h.pool.QueryRow(r.Context(),
		`UPDATE public.branch_zones SET name=COALESCE($1,name)
		 WHERE id=$2 AND tenant_id=$3 RETURNING id, tenant_id, id, name, 0`,
		req.Name, id, claims.TenantID).
		Scan(&t.ID, &t.TenantID, &t.AreaID, &t.Name, &t.Capacity)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "table not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update table")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, t)
}

func (h *Handler) deleteTable(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseID(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	// TODO: use public.branch_tables when available; branch_zones used as placeholder
	if _, err := h.pool.Exec(r.Context(),
		`DELETE FROM public.branch_zones WHERE id=$1 AND tenant_id=$2`, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete table")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

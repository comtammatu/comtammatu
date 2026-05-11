package settings

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// Handler serves settings endpoints for branches and areas under /admin/settings.
type Handler struct {
	pool    *pgxpool.Pool
	checker middleware.PermissionChecker
}

// New constructs a Handler. checker may be nil (skips ABAC — legacy mode).
func New(pool *pgxpool.Pool, checker middleware.PermissionChecker) *Handler {
	return &Handler{pool: pool, checker: checker}
}

// perm returns a RequirePermission middleware when a checker is configured,
// otherwise a no-op.
func (h *Handler) perm(key string) func(http.Handler) http.Handler {
	if h.checker == nil {
		return func(next http.Handler) http.Handler { return next }
	}
	return middleware.RequirePermission(h.checker, key)
}

// Routes returns a chi.Router with all settings sub-routes registered.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	branch := h.perm("settings:branch")

	r.With(branch).Get("/branches", h.listBranches)
	r.With(branch).Post("/branches", h.createBranch)
	r.With(branch).Get("/branches/{id}", h.getBranch)
	r.With(branch).Put("/branches/{id}", h.updateBranch)
	r.With(branch).Delete("/branches/{id}", h.deactivateBranch)

	r.With(branch).Get("/areas", h.listAreas)
	r.With(branch).Post("/areas", h.createArea)
	r.With(branch).Get("/areas/{id}", h.getArea)
	r.With(branch).Put("/areas/{id}", h.updateArea)

	r.With(branch).Get("/tables", h.listTables)
	r.With(branch).Post("/tables", h.createTable)
	r.With(branch).Put("/tables/{id}", h.updateTable)
	r.With(branch).Delete("/tables/{id}", h.deleteTable)

	r.With(branch).Get("/branches/{id}/pos-config", h.getBranchPOSConfig)

	return r
}

func (h *Handler) getBranchPOSConfig(w http.ResponseWriter, r *http.Request) {
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
	// Return basic branch config as POS config placeholder
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"branch_id": id,
		"tenant_id": claims.TenantID,
		"note":      "POS config not yet implemented — returns branch defaults",
	})
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func scanBranch(row interface {
	Scan(...any) error
}) (Branch, error) {
	var b Branch
	var address, phone sql.NullString
	var isActive sql.NullBool
	var createdAt sql.NullTime
	err := row.Scan(&b.ID, &b.TenantID, &b.Name, &address, &phone, &isActive, &createdAt)
	if address.Valid {
		b.Address = address.String
	}
	if phone.Valid {
		b.Phone = phone.String
	}
	if isActive.Valid {
		b.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		b.CreatedAt = createdAt.Time.String()
	}
	return b, err
}

func (h *Handler) listBranches(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, name, address, phone, is_active, created_at
		FROM public.branches
		WHERE tenant_id = $1
		ORDER BY (branch_kind != 'branch') DESC, name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch branches")
		return
	}
	defer rows.Close()
	result := make([]Branch, 0)
	for rows.Next() {
		b, err := scanBranch(rows)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read branches")
			return
		}
		result = append(result, b)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getBranch(w http.ResponseWriter, r *http.Request) {
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
	const q = `SELECT id, tenant_id, name, address, phone, is_active, created_at
		FROM public.branches
		WHERE id = $1 AND tenant_id = $2`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, id, claims.TenantID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch branch")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, b)
}

func (h *Handler) createBranch(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	var address, phone *string
	if req.Address != "" {
		address = &req.Address
	}
	if req.Phone != "" {
		phone = &req.Phone
	}
	const q = `INSERT INTO public.branches (tenant_id, name, address, phone)
		VALUES ($1, $2, $3, $4)
		RETURNING id, tenant_id, name, address, phone, is_active, created_at`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, claims.TenantID, req.Name, address, phone))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create branch")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, b)
}

func (h *Handler) updateBranch(w http.ResponseWriter, r *http.Request) {
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
	var req UpdateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	const q = `UPDATE public.branches
		SET name = COALESCE($1, name),
		    address = COALESCE($2, address),
		    phone = COALESCE($3, phone),
		    is_active = COALESCE($4, is_active),
		    updated_at = now()
		WHERE id = $5 AND tenant_id = $6
		RETURNING id, tenant_id, name, address, phone, is_active, created_at`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, req.Name, req.Address, req.Phone, req.IsActive, id, claims.TenantID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update branch")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, b)
}

func (h *Handler) deactivateBranch(w http.ResponseWriter, r *http.Request) {
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
	const q = `UPDATE public.branches SET is_active = false, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`
	if _, err := h.pool.Exec(r.Context(), q, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to deactivate branch")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listAreas(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, name FROM public.branch_zones
		WHERE tenant_id = $1
		ORDER BY branch_id, sort_order, name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch areas")
		return
	}
	defer rows.Close()
	result := make([]Area, 0)
	for rows.Next() {
		var a Area
		if err := rows.Scan(&a.ID, &a.TenantID, &a.Name); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read areas")
			return
		}
		result = append(result, a)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getArea(w http.ResponseWriter, r *http.Request) {
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
	const q = `SELECT id, tenant_id, name FROM public.branch_zones
		WHERE id = $1 AND tenant_id = $2`
	var a Area
	if err := h.pool.QueryRow(r.Context(), q, id, claims.TenantID).Scan(&a.ID, &a.TenantID, &a.Name); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "area not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch area")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, a)
}

func (h *Handler) createArea(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateAreaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if req.BranchID <= 0 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "branch_id is required")
		return
	}
	const q = `INSERT INTO public.branch_zones (tenant_id, branch_id, name)
		VALUES ($1, $2, $3)
		RETURNING id, tenant_id, name`
	var a Area
	if err := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.BranchID, req.Name).Scan(&a.ID, &a.TenantID, &a.Name); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create area")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, a)
}

func (h *Handler) updateArea(w http.ResponseWriter, r *http.Request) {
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
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	const q = `UPDATE public.branch_zones
		SET name = COALESCE($1, name),
		    sort_order = COALESCE(NULL, sort_order)
		WHERE id = $2 AND tenant_id = $3
		RETURNING id, tenant_id, name`
	var nameArg *string
	if req.Name != "" {
		nameArg = &req.Name
	}
	var a Area
	if err := h.pool.QueryRow(r.Context(), q, nameArg, id, claims.TenantID).Scan(&a.ID, &a.TenantID, &a.Name); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "area not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update area")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, a)
}

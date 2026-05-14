package settings

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
)

// isUniqueViolation reports whether err is a Postgres unique_violation (23505).
// Matches the menu handler's mapping: 23505 → 409 duplicate_name.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

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
	// Atomic is_active flip — replaces the legacy select-then-update pattern
	// in apps/web/app/admin/settings/branches/actions.ts toggleBranchActive.
	r.With(branch).Patch("/branches/{id}/toggle-active", h.toggleBranchActive)

	r.With(branch).Get("/areas", h.listAreas)
	r.With(branch).Post("/areas", h.createArea)
	r.With(branch).Get("/areas/{id}", h.getArea)
	r.With(branch).Put("/areas/{id}", h.updateArea)

	r.With(branch).Get("/tables", h.listTables)
	r.With(branch).Post("/tables", h.createTable)
	r.With(branch).Put("/tables/{id}", h.updateTable)
	r.With(branch).Delete("/tables/{id}", h.deleteTable)

	r.With(branch).Get("/branches/{id}/pos-config", h.getBranchPOSConfig)
	r.With(branch).Put("/branches/{id}/pos-config", h.updateBranchPOSConfig)

	return r
}

// posShiftTimeRe enforces HH:MM 24-hour format (00:00–23:59).
var posShiftTimeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// posCashFloatRe accepts non-negative decimal numbers up to 2 fractional digits,
// matching the NUMERIC(15,2) shape used everywhere else in the system.
var posCashFloatRe = regexp.MustCompile(`^\d{1,13}(\.\d{1,2})?$`)

// POSConfig is the JSON shape stored in branches.pos_config.
type POSConfig struct {
	ShiftStartTime   string `json:"shift_start_time"`
	CashFloatDefault string `json:"cash_float_default"`
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
	const q = `SELECT pos_config FROM public.branches WHERE id = $1 AND tenant_id = $2`
	var raw []byte
	if err := h.pool.QueryRow(r.Context(), q, id, claims.TenantID).Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch pos config")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

func (h *Handler) updateBranchPOSConfig(w http.ResponseWriter, r *http.Request) {
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

	var req POSConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !posShiftTimeRe.MatchString(req.ShiftStartTime) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "shift_start_time must be HH:MM (24h)")
		return
	}
	if !posCashFloatRe.MatchString(req.CashFloatDefault) {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "cash_float_default must be a non-negative decimal string (max 2 fractional digits)")
		return
	}

	payload, err := json.Marshal(req)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to encode pos config")
		return
	}

	const q = `UPDATE public.branches
		SET pos_config = $1::jsonb, updated_at = now()
		WHERE id = $2 AND tenant_id = $3
		RETURNING pos_config`
	var raw []byte
	if err := h.pool.QueryRow(r.Context(), q, string(payload), id, claims.TenantID).Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update pos config")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, json.RawMessage(raw))
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func scanBranch(row interface {
	Scan(...any) error
}) (Branch, error) {
	var b Branch
	var address, phone, branchKind sql.NullString
	var isActive sql.NullBool
	var createdAt sql.NullTime
	err := row.Scan(&b.ID, &b.TenantID, &b.Name, &address, &phone, &branchKind, &isActive, &createdAt)
	if address.Valid {
		b.Address = address.String
	}
	if phone.Valid {
		b.Phone = phone.String
	}
	if branchKind.Valid {
		b.BranchKind = branchKind.String
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
	const q = `SELECT id, tenant_id, name, address, phone, branch_kind, is_active, created_at
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
	const q = `SELECT id, tenant_id, name, address, phone, branch_kind, is_active, created_at
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
	if req.BranchKind == "" {
		req.BranchKind = "branch"
	}
	if !branchKinds[req.BranchKind] {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_branch_kind")
		return
	}
	var address, phone *string
	if req.Address != "" {
		address = &req.Address
	}
	if req.Phone != "" {
		phone = &req.Phone
	}
	const q = `INSERT INTO public.branches (tenant_id, name, address, phone, branch_kind)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, tenant_id, name, address, phone, branch_kind, is_active, created_at`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, claims.TenantID, req.Name, address, phone, req.BranchKind))
	if err != nil {
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
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
	if req.BranchKind != nil && !branchKinds[*req.BranchKind] {
		httputil.WriteError(w, http.StatusBadRequest, "invalid_branch_kind")
		return
	}
	const q = `UPDATE public.branches
		SET name = COALESCE($1, name),
		    address = COALESCE($2, address),
		    phone = COALESCE($3, phone),
		    branch_kind = COALESCE($4, branch_kind),
		    is_active = COALESCE($5, is_active),
		    updated_at = now()
		WHERE id = $6 AND tenant_id = $7
		RETURNING id, tenant_id, name, address, phone, branch_kind, is_active, created_at`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, req.Name, req.Address, req.Phone, req.BranchKind, req.IsActive, id, claims.TenantID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		if isUniqueViolation(err) {
			httputil.WriteError(w, http.StatusConflict, "duplicate_name")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update branch")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, b)
}

// toggleBranchActive flips is_active atomically — sibling of the menu module's
// toggle-active pattern. Replaces the legacy select-then-update in
// apps/web/app/admin/settings/branches/actions.ts toggleBranchActive (which had
// a TOCTOU window between read + flip).
func (h *Handler) toggleBranchActive(w http.ResponseWriter, r *http.Request) {
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
	const q = `UPDATE public.branches
		SET is_active = NOT is_active, updated_at = now()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, tenant_id, name, address, phone, branch_kind, is_active, created_at`
	b, err := scanBranch(h.pool.QueryRow(r.Context(), q, id, claims.TenantID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "branch not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to toggle branch")
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
		SET name = COALESCE($1, name)
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

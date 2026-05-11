package staff

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/personal/comtammatu/backend/internal/httputil"
	"github.com/personal/comtammatu/backend/internal/middleware"
	"golang.org/x/crypto/bcrypt"
)

// Handler serves staff management endpoints under /admin/staff.
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

// Routes returns a chi.Router with all staff sub-routes registered.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	view := h.perm("staff:view")
	manage := h.perm("staff:manage")
	assign := h.perm("staff:assign_permission")

	r.With(view).Get("/", h.listStaff)
	r.With(manage).Post("/", h.createStaff)
	r.With(view).Get("/{id}", h.getStaff)
	r.With(manage).Put("/{id}", h.updateStaff)
	r.With(manage).Delete("/{id}", h.deactivateStaff)
	r.With(assign).Get("/{id}/permissions", h.listPermissions)
	r.With(assign).Post("/{id}/permissions", h.grantPermission)
	r.With(assign).Delete("/{id}/permissions/{permKey}", h.revokePermission)
	r.With(manage).Post("/{id}/set-password", h.setPassword)

	return r
}

func parseID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func (h *Handler) listStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	const q = `SELECT id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at
		FROM public.users
		WHERE tenant_id = $1
		ORDER BY full_name`
	rows, err := h.pool.Query(r.Context(), q, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch staff")
		return
	}
	defer rows.Close()
	result := make([]StaffMember, 0)
	for rows.Next() {
		var s StaffMember
		var branchID sql.NullInt64
		var isActive sql.NullBool
		var createdAt sql.NullTime
		var idVal int64
		if err := rows.Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read staff")
			return
		}
		s.ID = strconv.FormatInt(idVal, 10)
		if branchID.Valid {
			s.BranchID = &branchID.Int64
		}
		if isActive.Valid {
			s.IsActive = isActive.Bool
		}
		if createdAt.Valid {
			s.CreatedAt = createdAt.Time.String()
		}
		result = append(result, s)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) getStaff(w http.ResponseWriter, r *http.Request) {
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
	const q = `SELECT id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at
		FROM public.users
		WHERE id = $1 AND tenant_id = $2`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, id, claims.TenantID).Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "staff not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) createStaff(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFrom(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req CreateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.FullName) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "full_name is required")
		return
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "email is invalid")
		return
	}
	if strings.TrimSpace(req.UserRole) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "user_role is required")
		return
	}
	// Elevated roles (owner, super_manager) require explicit permission beyond staff:manage.
	if req.UserRole == "owner" || req.UserRole == "super_manager" {
		if h.checker != nil {
			ok, err := h.checker.Can(r.Context(), claims.UserID, claims.TenantID, claims.BranchID, "staff:assign_elevated_role")
			if err != nil || !ok {
				httputil.WriteError(w, http.StatusForbidden, "assigning elevated role requires staff:assign_elevated_role permission")
				return
			}
		}
	}
	const q = `INSERT INTO public.users (tenant_id, branch_id, email, password_hash, full_name, user_role, is_active)
		VALUES ($1, $2, $3, '', $4, $5, false)
		RETURNING id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, claims.TenantID, req.BranchID, req.Email, req.FullName, req.UserRole).
		Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusCreated, s)
}

func (h *Handler) updateStaff(w http.ResponseWriter, r *http.Request) {
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
	var req UpdateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserRole != nil && (*req.UserRole == "owner" || *req.UserRole == "super_manager") {
		if h.checker != nil {
			ok, err := h.checker.Can(r.Context(), claims.UserID, claims.TenantID, claims.BranchID, "staff:assign_elevated_role")
			if err != nil || !ok {
				httputil.WriteError(w, http.StatusForbidden, "assigning elevated role requires staff:assign_elevated_role permission")
				return
			}
		}
	}
	const q = `UPDATE public.users
		SET full_name = COALESCE($1, full_name),
		    user_role = COALESCE($2, user_role),
		    branch_id = COALESCE($3, branch_id),
		    is_active = COALESCE($4, is_active),
		    updated_at = now()
		WHERE id = $5 AND tenant_id = $6
		RETURNING id, tenant_id, full_name, email, user_role, branch_id, is_active, created_at`
	var s StaffMember
	var idVal int64
	var branchID sql.NullInt64
	var isActive sql.NullBool
	var createdAt sql.NullTime
	if err := h.pool.QueryRow(r.Context(), q, req.FullName, req.UserRole, req.BranchID, req.IsActive, id, claims.TenantID).
		Scan(&idVal, &s.TenantID, &s.FullName, &s.Email, &s.UserRole, &branchID, &isActive, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.WriteError(w, http.StatusNotFound, "staff not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to update staff")
		return
	}
	s.ID = strconv.FormatInt(idVal, 10)
	if branchID.Valid {
		s.BranchID = &branchID.Int64
	}
	if isActive.Valid {
		s.IsActive = isActive.Bool
	}
	if createdAt.Valid {
		s.CreatedAt = createdAt.Time.String()
	}
	httputil.WriteJSON(w, http.StatusOK, s)
}

func (h *Handler) deactivateStaff(w http.ResponseWriter, r *http.Request) {
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
	const q = `UPDATE public.users SET is_active = false, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`
	if _, err := h.pool.Exec(r.Context(), q, id, claims.TenantID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to deactivate staff")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listPermissions(w http.ResponseWriter, r *http.Request) {
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
	const q = `SELECT id, permission_key, branch_id, effect, valid_from, valid_until, reason
		FROM public.user_permissions
		WHERE user_id = $1 AND tenant_id = $2
		ORDER BY permission_key`
	rows, err := h.pool.Query(r.Context(), q, id, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to fetch permissions")
		return
	}
	defer rows.Close()
	result := make([]UserPermission, 0)
	for rows.Next() {
		var p UserPermission
		var branchID sql.NullInt64
		var validUntil sql.NullTime
		var reason sql.NullString
		if err := rows.Scan(&p.ID, &p.PermissionKey, &branchID, &p.Effect, &p.ValidFrom, &validUntil, &reason); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to read permission")
			return
		}
		if branchID.Valid {
			p.BranchID = &branchID.Int64
		}
		if validUntil.Valid {
			t := validUntil.Time.String()
			p.ValidUntil = &t
		}
		if reason.Valid {
			p.Reason = reason.String
		}
		result = append(result, p)
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) grantPermission(w http.ResponseWriter, r *http.Request) {
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
	var req GrantPermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.PermissionKey) == "" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "permission_key is required")
		return
	}
	if req.Effect != "allow" && req.Effect != "deny" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "effect must be allow or deny")
		return
	}
	const q = `INSERT INTO public.user_permissions
		(user_id, tenant_id, permission_key, branch_id, effect, granted_by, valid_until, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, permission_key, branch_id, effect, valid_from, valid_until, reason`
	var p UserPermission
	var branchID sql.NullInt64
	var validUntil sql.NullTime
	var reason sql.NullString
	if err := h.pool.QueryRow(r.Context(), q,
		id, claims.TenantID, req.PermissionKey, req.BranchID, req.Effect,
		claims.UserID, req.ValidUntil, req.Reason,
	).Scan(&p.ID, &p.PermissionKey, &branchID, &p.Effect, &p.ValidFrom, &validUntil, &reason); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to grant permission")
		return
	}
	if branchID.Valid {
		p.BranchID = &branchID.Int64
	}
	if validUntil.Valid {
		t := validUntil.Time.String()
		p.ValidUntil = &t
	}
	if reason.Valid {
		p.Reason = reason.String
	}
	// Invalidate the ABAC cache for the affected user so the new permission takes effect immediately.
	if inv, ok := h.checker.(interface{ Invalidate(int64) }); ok {
		inv.Invalidate(id)
	}
	httputil.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) setPassword(w http.ResponseWriter, r *http.Request) {
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
	var req SetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Password) < 8 {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to set password")
		return
	}
	const q = `UPDATE public.users SET password_hash = $1, is_active = true, updated_at = now()
		WHERE id = $2 AND tenant_id = $3`
	tag, err := h.pool.Exec(r.Context(), q, string(hash), id, claims.TenantID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to set password")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "staff not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) revokePermission(w http.ResponseWriter, r *http.Request) {
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
	permKey := chi.URLParam(r, "permKey")
	if permKey == "" {
		httputil.WriteError(w, http.StatusBadRequest, "permKey is required")
		return
	}
	const q = `DELETE FROM public.user_permissions
		WHERE user_id = $1 AND tenant_id = $2 AND permission_key = $3`
	tag, err := h.pool.Exec(r.Context(), q, id, claims.TenantID, permKey)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to revoke permission")
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "permission not found")
		return
	}
	// Invalidate the ABAC cache so the revocation takes effect immediately.
	if inv, ok := h.checker.(interface{ Invalidate(int64) }); ok {
		inv.Invalidate(id)
	}
	w.WriteHeader(http.StatusNoContent)
}
